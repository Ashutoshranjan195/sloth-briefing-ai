"""FastAPI application for the Sloth Briefing web workspace."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .briefing import BriefingValidationError, _validate_briefing
from .config import AppSettings, ConfigurationError, SettingsStore, authorized_path, validate_settings
from .local_ai import LocalAIError, test_connection
from .scanner import Check, audit, summary
from .storage import HistoryStore, utc_now


class PathRequest(BaseModel):
    path: str = Field(min_length=1, max_length=4096)


class SettingsRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=500)
    model: str = Field(min_length=1, max_length=200)
    timeout: float = Field(ge=1, le=300)


def create_app(*, data_dir: Path | None = None) -> FastAPI:
    settings_store = SettingsStore(data_dir)
    history_store = HistoryStore(settings_store.data_dir)

    app = FastAPI(title="Sloth Briefing AI", version="0.2.0", docs_url="/api/docs", redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    def current_settings() -> AppSettings:
        try:
            settings = settings_store.load()
            if not settings_store.path.exists() and data_dir is not None:
                settings.allowed_roots = [str(data_dir.resolve().parent)]
            return settings
        except ConfigurationError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    def report_from_entry(entry: dict[str, Any]) -> dict[str, Any]:
        return {**entry, "hasBriefing": bool(entry.get("briefing"))}

    @app.get("/api/health")
    def health() -> dict[str, object]:
        settings = current_settings()
        return {"status": "ok", "service": "sloth-briefing-ai", "version": app.version, **settings.public(), "historyCount": len(history_store.list())}

    @app.get("/api/settings")
    def get_settings() -> dict[str, object]:
        return current_settings().public()

    @app.put("/api/settings")
    def put_settings(payload: SettingsRequest) -> dict[str, object]:
        current = current_settings()
        try:
            updated = validate_settings(endpoint=payload.endpoint, model=payload.model, timeout=payload.timeout)
            updated.allowed_roots = current.allowed_roots
            return settings_store.save(updated).public()
        except ConfigurationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/settings/test-connection")
    def settings_test_connection() -> dict[str, object]:
        settings = current_settings()
        try:
            return {"status": "connected", **test_connection(endpoint=settings.endpoint, model=settings.model, timeout=settings.timeout)}
        except LocalAIError as exc:
            return {"status": "unavailable", "model": settings.model, "error": str(exc)}

    @app.post("/api/repositories/validate")
    def validate_repository(payload: PathRequest) -> dict[str, object]:
        try:
            path = authorized_path(payload.path, current_settings())
        except ConfigurationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {"valid": True, "path": str(path), "name": path.name or str(path), "authorized": True}

    @app.post("/api/scans")
    def create_scan(payload: PathRequest) -> dict[str, Any]:
        try:
            root = authorized_path(payload.path, current_settings())
        except ConfigurationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        started = time.perf_counter()
        try:
            checks = audit(root)
        except Exception as exc:  # scanner failures are returned without internals
            raise HTTPException(status_code=500, detail="The repository scan could not be completed.") from exc
        report = {
            "status": "completed",
            "completedAt": utc_now(),
            "durationMs": round((time.perf_counter() - started) * 1000),
            "repository": str(root),
            "repositoryName": root.name or str(root),
            "summary": summary(checks),
            "checks": [check.to_dict() for check in checks],
            "briefing": None,
        }
        return report_from_entry(history_store.create(report))

    @app.get("/api/scans/{scan_id}")
    def get_scan(scan_id: str) -> dict[str, Any]:
        entry = history_store.get(scan_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Scan not found.")
        return report_from_entry(entry)

    @app.post("/api/scans/{scan_id}/briefing")
    def create_briefing(scan_id: str) -> dict[str, Any]:
        entry = history_store.get(scan_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Scan not found.")
        try:
            root = authorized_path(entry["repository"], current_settings())
            checks = [Check(**check) for check in entry.get("checks", [])]
            settings = current_settings()
            from .briefing import SYSTEM_PROMPT
            import json
            from .local_ai import chat_json

            result = chat_json(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=json.dumps({"repository": root.name, "summary": entry["summary"], "checks": entry["checks"]}, ensure_ascii=False),
                endpoint=settings.endpoint,
                model=settings.model,
                timeout=settings.timeout,
            )
            briefing = _validate_briefing(result, checks)
        except ConfigurationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except BriefingValidationError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except LocalAIError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        entry["briefing"] = briefing
        entry["briefingModel"] = current_settings().model
        history_store.delete(scan_id)
        history_store._write([entry, *[item for item in history_store.list() if item.get("id") != scan_id]])
        return report_from_entry(entry)

    @app.get("/api/history")
    def history(limit: int = Query(50, ge=1, le=100)) -> dict[str, object]:
        return {"items": [report_from_entry(item) for item in history_store.list()[:limit]]}

    @app.delete("/api/history/{scan_id}")
    def delete_history(scan_id: str) -> dict[str, object]:
        if not history_store.delete(scan_id):
            raise HTTPException(status_code=404, detail="Scan not found.")
        return {"deleted": True, "id": scan_id}

    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run("sloth_briefing_ai.api:app", host="127.0.0.1", port=8000, reload=False)
