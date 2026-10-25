"""Runtime configuration and authorization boundaries for the web app."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile

from .local_ai import DEFAULT_ENDPOINT, DEFAULT_MODEL, DEFAULT_TIMEOUT, LocalAIConfig, _is_loopback_endpoint


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / ".sloth-data"


class ConfigurationError(ValueError):
    """Raised when persisted or requested settings are invalid."""


def _env_roots() -> list[Path]:
    raw = os.environ.get("SLOTH_ALLOWED_ROOTS", "").strip()
    candidates = [item for item in raw.split(os.pathsep) if item.strip()] if raw else [str(Path.cwd())]
    roots: list[Path] = []
    for candidate in candidates:
        try:
            root = Path(candidate).expanduser().resolve(strict=True)
        except (OSError, RuntimeError, ValueError):
            continue
        if root.is_dir() and root not in roots:
            roots.append(root)
    return roots or [Path.cwd().resolve()]


@dataclass
class AppSettings:
    endpoint: str = DEFAULT_ENDPOINT
    model: str = DEFAULT_MODEL
    timeout: float = DEFAULT_TIMEOUT
    allowed_roots: list[str] | None = None

    def __post_init__(self) -> None:
        if self.allowed_roots is None:
            self.allowed_roots = [str(root) for root in _env_roots()]

    @property
    def local_ai(self) -> LocalAIConfig:
        return LocalAIConfig(endpoint=self.endpoint, model=self.model, timeout=self.timeout)

    def public(self) -> dict[str, object]:
        return {
            "endpoint": self.endpoint,
            "model": self.model,
            "timeout": self.timeout,
            "allowedRoots": self.allowed_roots or [],
            "privacy": {
                "localOnly": True,
                "sourceFilesSent": False,
                "repositoryCodeExecuted": False,
            },
        }


def validate_settings(*, endpoint: str, model: str, timeout: float) -> AppSettings:
    endpoint = endpoint.strip()
    model = model.strip()
    if not endpoint or not _is_loopback_endpoint(endpoint):
        raise ConfigurationError("The AI endpoint must use localhost, 127.0.0.1, or ::1.")
    if not model:
        raise ConfigurationError("The model name is required.")
    if not 1 <= timeout <= 300:
        raise ConfigurationError("The timeout must be between 1 and 300 seconds.")
    return AppSettings(endpoint=endpoint, model=model, timeout=timeout)


class SettingsStore:
    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = (data_dir or Path(os.environ.get("SLOTH_DATA_DIR", str(DEFAULT_DATA_DIR)))).expanduser().resolve()
        self.path = self.data_dir / "settings.json"

    def load(self) -> AppSettings:
        if not self.path.is_file():
            return AppSettings()
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise ValueError
            roots = payload.get("allowed_roots")
            settings = AppSettings(
                endpoint=str(payload.get("endpoint", DEFAULT_ENDPOINT)),
                model=str(payload.get("model", DEFAULT_MODEL)),
                timeout=float(payload.get("timeout", DEFAULT_TIMEOUT)),
                allowed_roots=[str(root) for root in roots] if isinstance(roots, list) else None,
            )
            validated = validate_settings(endpoint=settings.endpoint, model=settings.model, timeout=settings.timeout)
            validated.allowed_roots = settings.allowed_roots
            return validated
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            raise ConfigurationError("Saved settings are invalid or unreadable.") from exc

    def save(self, settings: AppSettings) -> AppSettings:
        validated = validate_settings(endpoint=settings.endpoint, model=settings.model, timeout=settings.timeout)
        validated.allowed_roots = settings.allowed_roots or [str(root) for root in _env_roots()]
        self.data_dir.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(asdict(validated), indent=2)
        with NamedTemporaryFile("w", encoding="utf-8", dir=self.data_dir, delete=False) as temporary:
            temporary.write(payload)
            temporary_path = Path(temporary.name)
        temporary_path.replace(self.path)
        return validated


def authorized_path(raw_path: str, settings: AppSettings) -> Path:
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise ConfigurationError("A repository directory path is required.")
    try:
        candidate = Path(raw_path).expanduser().resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as exc:
        raise ConfigurationError("The repository path does not exist or cannot be resolved.") from exc
    if not candidate.is_dir():
        raise ConfigurationError("The repository path must be an existing directory.")
    roots: list[Path] = []
    for raw_root in settings.allowed_roots or []:
        try:
            root = Path(raw_root).expanduser().resolve(strict=True)
        except (OSError, RuntimeError, ValueError):
            continue
        if root.is_dir():
            roots.append(root)
    if not roots:
        raise ConfigurationError("No authorized local directories are configured.")
    if not any(candidate == root or root in candidate.parents for root in roots):
        raise ConfigurationError("This directory is outside the configured authorized roots.")
    return candidate
