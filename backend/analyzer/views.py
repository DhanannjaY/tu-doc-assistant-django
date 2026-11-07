from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response

from .validators.structure import check_structure, validate_group, check_numbering_consistency, TEMPLATES, FORMATTING_STANDARDS
from .validators.wordcount import check_wordcount
from .validators.language import check_language
from .validators.formatting import check_formatting_hints
from .utils.file_extractor import extract_from_pdf, extract_from_docx, extract_formatting_from_docx
from .validators.feedback_generator import (
    generate_section_feedback,
    generate_wordcount_feedback,
)

MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024


@api_view(['GET'])
def get_templates(request):
    """Return all available TU BCA templates."""
    result = {}
    for key, tmpl in TEMPLATES.items():
        result[key] = {
            "name": tmpl["name"],
            "code": tmpl["code"],
            "semester": tmpl["semester"],
            "total_required_sections": len(tmpl["required_sections"]),
            "chapters": list(tmpl["chapter_structure"].keys()),
        }
    return Response({
        "templates": result,
        "formatting_standards": FORMATTING_STANDARDS,
    })


@api_view(['GET'])
def get_template_detail(request, doc_type):
    """Return full chapter structure for a specific template."""
    if doc_type not in TEMPLATES:
        return Response({"error": f"Unknown doc type. Choose: {list(TEMPLATES.keys())}"}, status=400)

    tmpl = TEMPLATES[doc_type]
    return Response({
        "name": tmpl["name"],
        "code": tmpl["code"],
        "semester": tmpl["semester"],
        "required_sections": tmpl["required_sections"],
        "optional_sections": tmpl["optional_sections"],
        "chapter_structure": tmpl["chapter_structure"],
        "formatting_standards": FORMATTING_STANDARDS,
    })


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def analyze_document(request):
    """
    Accepts:
      - file upload (PDF or DOCX) via multipart form
      - OR plain text via JSON { "text": "...", "doc_type": "..." }
    """
    doc_type = request.data.get('doc_type', 'project_2')
    file = request.FILES.get('file', None)
    text = request.data.get('text', '').strip()

    # Validation
    if doc_type not in TEMPLATES:
        return Response({"error": f"Invalid doc_type. Valid: {list(TEMPLATES.keys())}"}, status=400)

    # --- File upload handling ---
    docx_formatting = None  # only available for .docx
    file_type = None

    if file:
        extension = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else ''
        if extension not in ('pdf', 'docx'):
            return Response({"error": "Supported file types: PDF, DOCX"}, status=400)
        if file.size > MAX_DOCUMENT_UPLOAD_BYTES:
            return Response({"error": "The uploaded file exceeds the 10 MB limit."}, status=413)

        file_bytes = file.read()

        if extension == 'pdf':
            try:
                text = extract_from_pdf(file_bytes)
                file_type = 'pdf'
            except ValueError as e:
                return Response({"error": str(e)}, status=400)
        else:
            try:
                text = extract_from_docx(file_bytes)
                docx_formatting = extract_formatting_from_docx(file_bytes)
                file_type = 'docx'
            except ValueError as e:
                return Response({"error": str(e)}, status=400)

    # Validate text
    if not text:
        return Response({"error": "Document text vaa file required xa."}, status=400)
    if len(text.split()) < 30:
        return Response({"error": "Document content is too short. Full document upload/paste garnus."}, status=400)

    # Run validators
    try:
        structure = check_structure(text, doc_type)
        group_info = validate_group(text, doc_type)
        numbering_issues = check_numbering_consistency(text, doc_type)
        wordcount = check_wordcount(text, doc_type)
        language = check_language(text, doc_type)
        formatting = docx_formatting if docx_formatting else check_formatting_hints(text, doc_type)
    except Exception as e:
        import logging
        logging.error(f"Analysis error: {str(e)}")
        return Response({
            "error": "Analysis failed. Please try again or contact support."
        }, status=500)

    # Enhanced feedback generation
    section_guides = generate_section_feedback(structure['missing'], structure['found'], text, doc_type)
    enhanced_wordcount = generate_wordcount_feedback(wordcount['section_results'], doc_type)

    # Word-count estimates are guidance, not part of the readiness score.
    is_proposal = any(
        i.get('type') == 'error' and 'PROPOSAL' in i.get('message', '')
        for i in numbering_issues
    )
    structure_score = min(
        50,
        max(0, round((structure['sections_found'] / structure['total_required']) * 50)),
    )
    language_score = max(0, 35 - (len(language['issues']) * 8) - (len(language['warnings']) * 3))
    fmt_errors = len([f for f in formatting['formatting_hints'] if f['type'] == 'error'])
    fmt_score = max(0, 15 - (fmt_errors * 4))
    total_score = min(100, structure_score + language_score + fmt_score)

    if is_proposal:
        total_score = min(total_score, 20)  # cap proposal score at 20

    actionable_types = {'error', 'warning'}
    total_issues = (
        len(structure['missing'])
        + len(structure['subsection_issues'])
        + sum(i.get('type') in actionable_types for i in numbering_issues)
        + sum(i.get('type') in actionable_types for i in group_info['group_feedback'])
        + len(language['issues'])
        + len(language['warnings'])
        + sum(
            f.get('type') in actionable_types
            for f in formatting['formatting_hints']
        )
    )

    return Response({
        "doc_type": doc_type,
        "template_name": structure["template"],
        "semester": structure["semester"],
        "course_code": structure["course_code"],
        "file_type": file_type or "text",
        "score": total_score,
        "score_breakdown": {
            "structure": {"score": structure_score, "max": 50},
            "language": {"score": language_score, "max": 35},
            "formatting": {"score": fmt_score, "max": 15},
            "proposal_cap": 20 if is_proposal else None,
        },
        "total_words": wordcount['total_words'],
        "numbering_issues": numbering_issues,
        "total_issues": total_issues,
        "structure": {
            "sections_found": structure['sections_found'],
            "total_required": structure['total_required'],
            "chapters_found": structure['chapters_found'],
            "missing": structure['missing'],
            "subsection_issues": structure['subsection_issues'],
        },
        "group_info": {
            "member_count": group_info["member_count"],
            "member_names": group_info["member_names"],
            "roll_nos": group_info["roll_nos"],
            "feedback": group_info["group_feedback"],
        },
        "section_guides": section_guides,
        "passive_fixes": language.get('active_first_person', []),
        "informal_fixes": language.get('informal_words', []),
        "wordcount": enhanced_wordcount,
        "language": language['all_feedback'],
        "formatting": formatting['formatting_hints'],
        "grammar_issues": language.get('grammar_issues', []),
        "ieee_results": language.get('ieee_results', []),
        "academic_tone": language.get('academic_tone', []),
    })