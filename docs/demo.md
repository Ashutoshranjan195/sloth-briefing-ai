# Sloth Briefing AI Demo

This is a standalone demo. It can inspect any existing repository directory
without importing Clone to Confidence.

## Deterministic scan

```powershell
python -m sloth_briefing_ai C:\path\to\repository --format json
```

The scanner reads repository metadata and selected text files. It never runs
target-repository code.

## Local open-weight briefing

```powershell
ollama pull qwen2.5:3b
python -m sloth_briefing_ai C:\path\to\repository
```

The local model receives only:

- The repository directory name
- Deterministic check statuses
- Relative evidence labels
- Explanations and remediation text

The absolute filesystem path and arbitrary source files stay out of the model
prompt. The default endpoint is loopback-only, so the application does not
send repository evidence to a remote service accidentally.

## Example output shape

```text
SLOTH BRIEFING
Repository: example-repository
Model: qwen2.5:3b
Audit: 6 PASS | 1 FAIL | 1 WARN

Make the next clone boring
The project has most reproducibility signals in place. Two small documentation
tasks would remove the remaining uncertainty.

LOW-EFFORT NEXT STEPS
1. [low] Document the exact test command (test_command)
   Why: No documented test command was found
```

When the model is unavailable, the command exits with status `2` and reports
`AI UNAVAILABLE`. There is no cloud fallback.
