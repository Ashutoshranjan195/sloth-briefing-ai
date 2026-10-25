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

## License

MIT. See `LICENSE`.
