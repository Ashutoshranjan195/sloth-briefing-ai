# Sloth Briefing AI

An independent, offline-first repository scanner that uses a local open-weight
model to turn deterministic evidence into a short, low-effort maintenance
briefing.

This project is standalone. It does not import or require Clone to Confidence.
The scanner implements its own minimal checks for Git history, dependency
lockfiles, runtime pins, Docker packaging, test discoverability, README
guidance, environment placeholders, and machine-specific absolute paths.

## Requirements

- Python 3.12 or newer
- Optional: [Ollama](https://ollama.com/) for local AI briefings
- A local Ollama model, such as `qwen2.5:3b`

The web workspace adds FastAPI and Uvicorn. The frontend uses React, TypeScript,
and Vite under `frontend/`.

The runtime uses only Python’s standard library. Pytest is used for the test
suite when it is available in the active Python environment.

## Install

From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
```

For source checkout development, the project also supports running directly
with `python -m sloth_briefing_ai` when `src` is on `PYTHONPATH`.

## Run a deterministic scan

```powershell
python -m sloth_briefing_ai C:\path\to\repository
python -m sloth_briefing_ai C:\path\to\repository --format json
python -m sloth_briefing_ai C:\path\to\repository --scan-only
```

The scanner never executes code from the target repository.

## Run the local AI briefing

Pull a model once:

```powershell
ollama pull qwen2.5:3b
```

Then run:

```powershell
python -m sloth_briefing_ai C:\path\to\repository
```

The default endpoint is:

```text
http://127.0.0.1:11434/v1/chat/completions
```

The model receives only the repository name plus structured scanner results.
It does not receive the absolute path or arbitrary source-file contents.

## Configuration

```powershell
$env:SLOTH_BRIEFING_MODEL = "qwen2.5:3b"
$env:SLOTH_BRIEFING_ENDPOINT = "http://127.0.0.1:11434/v1/chat/completions"
$env:SLOTH_BRIEFING_TIMEOUT = "30"
```

These variables are optional overrides. The application has safe local defaults
for the Ollama endpoint, model, timeout, data directory, and authorized root,
so a `.env` file is not required.

The following flags override environment values:

```powershell
python -m sloth_briefing_ai C:\path\to\repository `
  --model qwen2.5:3b `
  --endpoint http://127.0.0.1:11434/v1/chat/completions `
  --timeout 60
```

Only loopback endpoints are accepted by default. Set
`SLOTH_BRIEFING_ALLOW_REMOTE=1` only when sending repository evidence to a
remote endpoint is intentional.

When the local model is unavailable, the command returns a clear
`AI UNAVAILABLE` result and does not fall back to a cloud provider.

## Output

Text mode shows the audit count, the model-generated headline and summary, and
up to three actions linked to real scanner check IDs. JSON mode includes the
deterministic checks, summary, model name, and validated briefing object.

## Tests

```powershell
python -m pytest -q
```

The tests mock the local model endpoint. They do not need Ollama or internet
access.

## Web workspace

The web app is a real local workspace backed by the scanner and Ollama client.
It does not ship sample scan data: the overview starts empty until a permitted
directory is scanned.

### Windows setup

From the project directory:

```powershell
python -m pip install -e .
cd frontend
npm install
cd ..
```

Configure which local directories the API may scan. By default, the backend
allows the directory where it is launched. To authorize more roots, use the
Windows path separator (`;`):

```powershell
$env:SLOTH_ALLOWED_ROOTS = "C:\path\to\repositories;C:\work"
```

Start the backend in one terminal:

```powershell
python -m uvicorn sloth_briefing_ai.api:app --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173/`.

### Docker backend

Build the backend image from the project root:

```powershell
docker build -t sloth-briefing-ai-backend .
```

Run it with an explicit host directory mounted under the authorized `/app`
root:

```powershell
docker run --rm -p 8000:8000 `
  -v "C:\work\repository:/app/repository:ro" `
  -e SLOTH_ALLOWED_ROOTS=/app/repository `
  -e SLOTH_BRIEFING_ENDPOINT=http://host.docker.internal:11434/v1/chat/completions `
  sloth-briefing-ai-backend
```

Ollama is not installed in or assumed to be running inside the container. The
endpoint is supplied at runtime so the backend can use an Ollama service on the
Windows host or another explicitly reachable local service. The frontend still
runs separately with `npm run dev` and connects to the published backend port.

The frontend calls these real API flows:

- `POST /api/repositories/validate` for path authorization
- `POST /api/scans` for deterministic scanning
- `POST /api/scans/{id}/briefing` for local AI generation
- `GET /api/history`, `GET /api/scans/{id}`, and `DELETE /api/history/{id}` for persistence
- `GET /api/settings`, `PUT /api/settings`, and `POST /api/settings/test-connection` for model configuration

Interactive API documentation is available at `http://127.0.0.1:8000/api/docs`.

## Architecture

```text
React/Vite frontend
        │ typed REST calls
        ▼
FastAPI API + local JSON stores
        │
        ├── deterministic scanner (never executes repository code)
        └── Ollama-compatible local model (structured evidence only)
```

Scan history is stored in `.sloth-data/history.json` and settings in
`.sloth-data/settings.json`. These files are local runtime state and should not
be committed.

## Security and privacy boundaries

- Repository paths must resolve under configured authorized roots.
- Symlink targets are skipped by the scanner; arbitrary remote URLs are not accepted.
- The scanner reads metadata and selected text evidence but never runs target-repository code.
- The AI prompt contains the repository name and structured check evidence, not arbitrary source files or the absolute path.
- Local loopback AI endpoints are required by default; remote endpoints require an explicit environment opt-in in the client layer.
- API errors are sanitized before returning to the browser.
- This is a local developer tool, not a complete sandbox for hostile repositories. Review filesystem permissions and run it under a least-privilege account.

## License

MIT. See `LICENSE`.
