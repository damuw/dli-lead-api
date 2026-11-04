# DLI Lead API

Express service that receives DLI website leads and research-PDF requests, then
forwards them by email using the existing company SMTP server (no email server
change required). PDFs are delivered as **download links**, not attachments.

## Endpoints

- `GET /api/health` — health check.
- `POST /api/leads` — body:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@company.com",
    "organization": "Acme",
    "market": "UAE",
    "need": "AI agent or workflow",
    "timeline": "Within 30 days",
    "problem": "We need support triage automation.",
    "resource": "jobs-of-the-future",
    "consent": true,
    "consentAt": "2026-11-05T10:00:00.000Z",
    "source": "homepage-brief"
  }
  ```
  `resource` is optional (`the-power-of-innovation-in-recession` | `jobs-of-the-future`).
  `consent` / `consentAt` / `source` are optional metadata added in November 2026.

  Readiness requests add an optional, bounded `assessment` object:
  ```json
  {
    "segment": "government",
    "profile": "Forming",
    "average": 1.75,
    "dimensions": [{ "label": "Mandate & ownership", "value": 2 }],
    "gaps": [{ "title": "Classify data before connecting it", "severity": "High" }],
    "answers": { "Mandate & ownership": "A named service owner with an executive sponsor" },
    "consent": true,
    "consentAt": "2026-11-05T10:00:00.000Z",
    "source": "homepage-readiness"
  }
  ```
  The API truncates and bounds every field (8 dimensions, 5 gaps, 10 answers, 200 chars
  each), then appends a `READINESS ASSESSMENT` block to the notification email. It does not
  store the data; delivery is email only.

## Env vars

- `PORT` (default 3000)
- `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`
- `MAIL_FROM` (default `Deep Learning Intelligence <no-reply@deeplearningintelligence.com>`)
- `LEAD_TO` (default `damu@DeepLearningIntelligence.com`)

## Deploy

Build: `docker build -t dli-lead-api .`

PDFs are served by the marketing site from `https://deeplearningintelligence.com/resources/`.
Set `PUBLIC_SITE_URL` if the site origin changes.

Coolify notes: set the service env vars, expose port 3000, and add the domain
(e.g. `api.deeplearningintelligence.com`) in Coolify → the marketing site should
point its `VITE_LEAD_API_URL` (or `PUBLIC_LEAD_API_URL`) at this origin.
