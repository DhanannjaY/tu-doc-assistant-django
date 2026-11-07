# TU BCA Document Assistant

A rule-based academic document validator for **Tribhuvan University (TU) FOHSS** students. Helps validate BCA project reports and internship reports against official TU formatting guidelines.

---

## Supported Documents

| Semester | Document | Course Code |
|----------|----------|-------------|
| 4th | Project I | CACS256 |
| 6th | Project II | CAPJ356 |
| 7th | Internship Report | CAIN403 |
| 8th | Project III | CACS452 |

---

## Features
- Section structure detection (required vs missing sections)
- Proposal vs final report detection
- Grammar analysis using spaCy + LanguageTool
- Passive voice / first-person detection with fix suggestions
- Informal vocabulary checker with academic replacements
- Academic tone check (contractions, future tense, vague language)
- IEEE citation validation (Projects) / APA citation validation (Internship)
- DOCX formatting check (font, margins, spacing, page size)
- Group member detection with roll/regd number parsing
- Proposal vs final report detection
- Chapter numbering consistency check
- PDF + DOCX file upload support
- TOC-aware word count analysis per section
- Analysis report download (print-to-PDF)
---

## Tech Stack

- **Backend:** Python, Django, Django REST Framework
- **NLP:** spaCy (en_core_web_sm), LanguageTool
- **File parsing:** pdfplumber, python-docx
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Environment:** python-dotenv (.env based config)

---

## Project Structure

```
tu-doc-assistant/
├── backend/
│   ├── config/
│   │   ├── settings.py
│   │   └── urls.py
│   ├── analyzer/
│   │   ├── validators/
│   │   │   ├── structure.py        ← Section detection
│   │   │   ├── wordcount.py        ← Word count analysis
│   │   │   ├── language.py         ← Grammar + tone check
│   │   │   ├── formatting.py       ← TU format rules
│   │   │   └── feedback_generator.py ← Fix suggestions
│   │   ├── utils/
│   │   │   └── file_extractor.py   ← PDF/DOCX parser
│   │   └── views.py
│   ├── manage.py
│   ├── requirements.txt
│   └── .env                        ← Create this (see setup)
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## Setup & Installation

### Requirements
- Python 3.10+
- pip
- Java (required by LanguageTool — install from java.com)

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/yourusername/tu-doc-assistant.git
cd tu-doc-assistant
```

**2. Create and activate virtual environment**
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Download spaCy language model**
```bash
python -m spacy download en_core_web_sm
```

**5. Create `.env` file**

Create `backend/.env` with the following:
```env
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Generate a secret key:
```bash
python -c "from django.utils.crypto import get_random_string; print(get_random_string(50))"
```

**6. Run migrations**
```bash
python manage.py migrate
```

**7. Start the backend server**
```bash
python manage.py runserver
```

Backend runs at: `http://127.0.0.1:8000`

**8. Open the frontend**
```bash
cd ../frontend
python -m http.server 3000
```

Open browser: `http://localhost:3000`

> **Note:** First request may take 20-30 seconds as LanguageTool 
> downloads its JAR file (~259MB) on first run. This happens once only.
> Java must be installed for LanguageTool to work.
> DOCX upload recommended over PDF for accurate formatting analysis.

The frontend defaults to the API at `http(s)://<current-host>:8000/api`. For deployments where the API has a different URL, define `window.DOC_ASSISTANT_API_URL` before `app.js` loads. Set `CORS_ALLOWED_ORIGINS` to the exact frontend origins; do not enable wildcard CORS in production. Uploaded documents are limited to 10 MB and are not retained as document history by this application.

For production, set `DEBUG=False`, provide a strong `SECRET_KEY`, and set `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` to the deployment’s hostnames and HTTPS frontend origins. With `DEBUG=False`, HTTPS redirects, secure session/CSRF cookies, and one-year HSTS are enabled by default. Enable `SECURE_HSTS_INCLUDE_SUBDOMAINS` only when every subdomain is HTTPS-only; set `SECURE_HSTS_PRELOAD` only when that commitment is intentional. If TLS terminates at a reverse proxy, configure Django to trust only that proxy’s HTTPS-forwarding header before enabling redirects. Use a production database and review the Django deployment checklist for the hosting environment.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/templates/` | List all TU templates |
| GET | `/api/templates/<doc_type>/` | Get template details |
| POST | `/api/analyze/` | Analyze a document |

### Analyze endpoint

**File upload (PDF/DOCX):**
```
POST /api/analyze/
Content-Type: multipart/form-data

file: <file>
doc_type: project_1 | project_2 | internship | project_3
```
Uploads larger than 10 MB are rejected with HTTP 413.

**Plain text:**
```
POST /api/analyze/
Content-Type: application/json

{
  "text": "document content here...",
  "doc_type": "project_2"
}
```

The readiness score is advisory, not an official grade. Its 100 points are allocated to structure (50), language (35), and formatting (15); word-count estimates are guidance only and do not affect the score. The `total_issues` response field counts actionable findings (errors and warnings), not informational notes.

---

## Formatting Standards (TU FOHSS)

| Element | Standard |
|---------|----------|
| Font | Times New Roman |
| Chapter heading | 16pt Bold, Center |
| Section heading | 14pt Bold, Left |
| Sub-section | 12pt Bold |
| Body text | 12pt Regular, Justified |
| Line spacing | 1.5 |
| Left margin | 1.25 inch (35mm) |
| Right/Top/Bottom | 1.0 inch |
| Page numbering | Roman (front matter), Arabic (Chapter 1+) |
| Referencing | IEEE format |
| Binding | Golden Embracing, Black Cover |
| Copies | 3 (Library + Self + Dean Office) |
| Referencing | IEEE format (Projects) / APA format (Internship) |

---

## Contributing

This project is built for TU BCA students. Contributions welcome:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit changes (`git commit -m 'Add your feature'`)
4. Push to branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## Dependencies

django
djangorestframework
django-cors-headers
pdfplumber
python-docx
spacy
language-tool-python
python-dotenv

---

## License

MIT License — free to use and modify.

---

## Acknowledgements

- Tribhuvan University, Faculty of Humanities and Social Sciences
- TU CDC Official BCA Curriculum Syllabus, Documents