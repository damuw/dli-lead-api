# DLI Lead API

Express service that receives DLI website leads and research-PDF email requests,
then forwards them by email using the existing company SMTP server (no email server
change required).

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
    "resource": "jobs-of-the-future"
  }
  ```
  `resource` is optional (`the-power-of-innovation-in-recession` | `jobs-of-the-future`).

## Env vars

- `PORT` (default 3000)
- `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`
- `MAIL_FROM` (default `Deep Learning Intelligence <no-reply@deeplearningintelligence.com>`)
- `LEAD_TO` (default `damu@DeepLearningIntelligence.com`)

## Deploy

Build: `docker build -t dli-lead-api .`

The container expects the two briefing PDFs at `/app/resources/`:
- `The-Power-of-Innovation-in-Recession.pdf`
- `Jobs-of-the-Future.pdf`

Coolify notes: set the service env vars, expose port 3000, and add the domain
(e.g. `api.deeplearningintelligence.com`) in Coolify → the marketing site should
point its `VITE_LEAD_API_URL` (or `PUBLIC_LEAD_API_URL`) at this origin.
