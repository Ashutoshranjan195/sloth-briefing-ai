# Sloth Briefing AI Web App Design Brief

Implement the real React/Vite frontend for the existing FastAPI API in this
repository. Do not add mock data or a static landing page. All scan, history,
settings, connection-test, briefing, filter, search, copy, delete, and export
interactions must use real API responses.

## Objective

Create a premium developer-tool workspace for developers who want a calm,
evidence-first read on repository health and the smallest next maintenance
steps. The scanner is deterministic; the local model only explains verified
evidence.

## Aesthetic direction

Opinionated midnight workspace: deep navy canvas, layered graphite panels,
emerald mint for verified/pass states, lavender for AI, restrained indigo-blue
gradient accents. Typography should feel technical but editorial: use a clean
system sans with a monospace treatment for paths, IDs, timestamps, and status
labels. Keep the page dense enough for developer work but with generous rhythm.
Avoid neon, excessive blur, emoji, fake charts, fake percentages, and generic
admin-dashboard styling.

## Content structure

- Fixed sidebar with product mark, workspace navigation (Overview, History,
  Settings), connection status, and GitHub link.
- Main workspace header with repository context, authorized-path helper, and a
  primary Scan repository action.
- Overview route: empty state until a scan exists; after a real scan show
  metrics computed from API summary, scan metadata, findings explorer with
  search/severity/status/sort controls, and an AI briefing panel with real
  unavailable/error states.
- History route: real persisted scan entries with open and delete actions.
- Settings route: editable local endpoint/model/timeout, connection test, and
  privacy/local-processing explanation.
- Responsive mobile layout: sidebar becomes a top bar / compact nav and cards
  stack without losing controls.

## Interaction rules

- No fabricated results. Show an intentional empty state before the first scan.
- Scan button calls POST /api/scans and disables itself while waiting.
- Briefing button calls POST /api/scans/{id}/briefing and displays real errors.
- Search/filter/sort operate on the current findings in memory.
- Export downloads the actual current report JSON.
- History opens actual stored reports and deletes through the API.
- Settings save and connection test use the API.

## Output

Implement files under `frontend/` using React + TypeScript + Vite and custom
CSS. Configure `/api` proxy to the FastAPI backend at `http://127.0.0.1:8000`.
The frontend must build with `npm run build`.

## Images

No external images are needed. Use CSS geometry and inline accessible icons.
