from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from .views import MAX_DOCUMENT_UPLOAD_BYTES


class AnalyzeDocumentTests(APITestCase):
    def test_oversized_file_is_rejected_before_extraction(self):
        uploaded_file = SimpleUploadedFile(
            'large.pdf',
            b'x' * (MAX_DOCUMENT_UPLOAD_BYTES + 1),
            content_type='application/pdf',
        )

        with patch('analyzer.views.extract_from_pdf') as extract_pdf:
            response = self.client.post(
                '/api/analyze/',
                {'file': uploaded_file, 'doc_type': 'project_2'},
                format='multipart',
            )

        self.assertEqual(response.status_code, 413)
        self.assertEqual(
            response.data['error'],
            'The uploaded file exceeds the 10 MB limit.',
        )
        extract_pdf.assert_not_called()

    @patch('analyzer.views.generate_wordcount_feedback', return_value=[])
    @patch('analyzer.views.generate_section_feedback', return_value=[])
    @patch('analyzer.views.check_formatting_hints')
    @patch('analyzer.views.check_language')
    @patch('analyzer.views.check_wordcount')
    @patch('analyzer.views.check_numbering_consistency')
    @patch('analyzer.views.validate_group')
    @patch('analyzer.views.check_structure')
    def test_score_breakdown_and_actionable_issue_count(
        self,
        check_structure,
        validate_group,
        check_numbering,
        check_wordcount,
        check_language,
        check_formatting,
        _generate_section_feedback,
        _generate_wordcount_feedback,
    ):
        check_structure.return_value = {
            'sections_found': 4,
            'total_required': 10,
            'missing': ['Abstract'],
            'found': [],
            'template': 'Project II',
            'semester': '6th',
            'course_code': 'CAPJ356',
            'chapters_found': [],
            'subsection_issues': ['1.1'],
        }
        validate_group.return_value = {
            'member_count': 2,
            'member_names': [],
            'roll_nos': [],
            'group_feedback': [
                {'type': 'warning', 'message': 'Review group details.'},
                {'type': 'success', 'message': 'Group size is valid.'},
            ],
        }
        check_numbering.return_value = [
            {'type': 'warning', 'message': 'Review chapter numbering.'}
        ]
        check_wordcount.return_value = {
            'total_words': 42,
            'section_results': [{'type': 'info', 'message': 'Estimated count.'}],
        }
        check_language.return_value = {
            'issues': ['grammar issue'],
            'warnings': ['tone warning'],
            'all_feedback': [],
            'active_first_person': [],
            'informal_words': [],
        }
        check_formatting.return_value = {
            'formatting_hints': [
                {'type': 'error', 'message': 'Formatting error.'},
                {'type': 'warning', 'message': 'Formatting warning.'},
                {'type': 'info', 'message': 'Formatting note.'},
            ]
        }

        response = self.client.post(
            '/api/analyze/',
            {
                'text': 'A sufficiently long sample document containing more than thirty words '
                'so the analysis endpoint will process the request for this test. '
                'This additional sentence ensures the fixture satisfies the minimum word count.',
                'doc_type': 'project_2',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['score'], 55)
        self.assertEqual(
            response.data['score_breakdown'],
            {
                'structure': {'score': 20, 'max': 50},
                'language': {'score': 24, 'max': 35},
                'formatting': {'score': 11, 'max': 15},
                'proposal_cap': None,
            },
        )
        self.assertEqual(
            sum(
                item['max']
                for key, item in response.data['score_breakdown'].items()
                if key != 'proposal_cap'
            ),
            100,
        )
        self.assertEqual(response.data['total_issues'], 8)
