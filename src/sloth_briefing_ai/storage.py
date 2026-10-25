"""Small atomic JSON stores for local scan history."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class HistoryStore:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.path = data_dir / "history.json"

    def _read(self) -> list[dict[str, Any]]:
        if not self.path.is_file():
            return []
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, list) else []
        except (OSError, ValueError, json.JSONDecodeError):
            return []

    def _write(self, entries: list[dict[str, Any]]) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile("w", encoding="utf-8", dir=self.data_dir, delete=False) as temporary:
            json.dump(entries[:100], temporary, indent=2)
            temporary_path = Path(temporary.name)
        temporary_path.replace(self.path)

    def create(self, report: dict[str, Any]) -> dict[str, Any]:
        entry = {"id": uuid.uuid4().hex, "createdAt": utc_now(), **report}
        entries = self._read()
        self._write([entry, *entries])
        return entry

    def list(self) -> list[dict[str, Any]]:
        return self._read()

    def get(self, scan_id: str) -> dict[str, Any] | None:
        return next((entry for entry in self._read() if entry.get("id") == scan_id), None)

    def delete(self, scan_id: str) -> bool:
        entries = self._read()
        kept = [entry for entry in entries if entry.get("id") != scan_id]
        if len(kept) == len(entries):
            return False
        self._write(kept)
        return True
