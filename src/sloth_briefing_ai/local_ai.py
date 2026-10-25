"""Local-only OpenAI-compatible client for Ollama and other loopback runtimes."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


DEFAULT_ENDPOINT = "http://127.0.0.1:11434/v1/chat/completions"
DEFAULT_MODEL = "qwen2.5:3b"
DEFAULT_TIMEOUT = 30.0


class LocalAIError(RuntimeError):
    """Base error for local model configuration or response failures."""


class LocalAIUnavailable(LocalAIError):
    """The configured local model endpoint could not be reached."""


class LocalAIResponseError(LocalAIError):
    """The model endpoint returned an unusable response."""


@dataclass(frozen=True)
class LocalAIConfig:
    endpoint: str = DEFAULT_ENDPOINT
    model: str = DEFAULT_MODEL
    timeout: float = DEFAULT_TIMEOUT

    @classmethod
    def from_environment(cls, *, endpoint: str | None = None, model: str | None = None, timeout: float | None = None) -> "LocalAIConfig":
        raw_timeout = os.environ.get("SLOTH_BRIEFING_TIMEOUT", str(DEFAULT_TIMEOUT))
        try:
            configured_timeout = float(raw_timeout)
        except ValueError:
            configured_timeout = DEFAULT_TIMEOUT
        return cls(
            endpoint=(endpoint or os.environ.get("SLOTH_BRIEFING_ENDPOINT", DEFAULT_ENDPOINT)).strip(),
            model=(model or os.environ.get("SLOTH_BRIEFING_MODEL", DEFAULT_MODEL)).strip(),
            timeout=timeout if timeout is not None else configured_timeout,
        )


def _is_loopback_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    return parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost", "::1"}


def _validate_config(config: LocalAIConfig) -> None:
    if not config.endpoint:
        raise LocalAIError("A local AI endpoint is required.")
    if not config.model:
        raise LocalAIError("A local AI model name is required.")
    if config.timeout <= 0:
        raise LocalAIError("The local AI timeout must be greater than zero.")
    if not _is_loopback_endpoint(config.endpoint) and os.environ.get("SLOTH_BRIEFING_ALLOW_REMOTE") != "1":
        raise LocalAIError(
            "The AI endpoint must be local (localhost, 127.0.0.1, or ::1). "
            "Set SLOTH_BRIEFING_ALLOW_REMOTE=1 only when a remote endpoint is intentional."
        )


def _json_from_content(content: str) -> dict[str, object]:
    cleaned = content.strip()
    if cleaned.startswith("```") and cleaned.endswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(lines[1:-1]).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LocalAIResponseError("The local model did not return valid JSON.") from exc
    if not isinstance(value, dict):
        raise LocalAIResponseError("The local model returned JSON, but not an object.")
    return value


def _extract_content(response: object) -> str:
    if not isinstance(response, dict):
        raise LocalAIResponseError("The local model response was not a JSON object.")
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise LocalAIResponseError("The local model response did not contain a choice.")
    first = choices[0]
    if not isinstance(first, dict):
        raise LocalAIResponseError("The local model response contained an invalid choice.")
    message = first.get("message")
    if not isinstance(message, dict) or not isinstance(message.get("content"), str):
        raise LocalAIResponseError("The local model response did not contain message content.")
    return message["content"]


def chat_json(*, system_prompt: str, user_prompt: str, endpoint: str | None = None, model: str | None = None, timeout: float | None = None) -> dict[str, object]:
    """Send one JSON-constrained chat request to a local model."""

    config = LocalAIConfig.from_environment(endpoint=endpoint, model=model, timeout=timeout)
    _validate_config(config)
    body = json.dumps(
        {
            "model": config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "stream": False,
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")
    request = Request(config.endpoint, data=body, headers={"Content-Type": "application/json", "Accept": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=config.timeout) as response:
            raw = response.read()
    except HTTPError as exc:
        if exc.code in {404, 408, 502, 503, 504}:
            raise LocalAIUnavailable("The local model endpoint is unavailable or the model is missing.") from exc
        raise LocalAIError(f"The local model endpoint returned HTTP {exc.code}.") from exc
    except (TimeoutError, URLError, OSError) as exc:
        raise LocalAIUnavailable("Could not reach the local model. Start Ollama and confirm that the model has been pulled.") from exc
    try:
        response_data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise LocalAIResponseError("The local model endpoint returned invalid JSON.") from exc
    return _json_from_content(_extract_content(response_data))
