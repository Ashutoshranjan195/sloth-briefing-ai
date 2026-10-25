import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from sloth_briefing_ai.api import create_app


def make_repo(parent: Path) -> Path:
    root = parent / "fixture"
    root.mkdir()
    (root / "pyproject.toml").write_text('[project]\nname = "fixture"\n')
    (root / "uv.lock").write_text("version = 1\n")
    (root / ".python-version").write_text("3.12\n")
    (root / "Dockerfile").write_text("FROM python:3.12-slim\n")
    (root / "README.md").write_text("# Fixture\n\n## Setup\ninstall\n\n## Run\nrun\n\n## Test\npytest\n")
    (root / ".env.example").write_text("TOKEN=YOUR_VALUE_HERE\n")
    return root


def client_for(tmp_path: Path):
    repo = make_repo(tmp_path)
    app = create_app(data_dir=tmp_path / "data")
    return TestClient(app), repo


def test_health_and_path_boundary(tmp_path: Path):
    client, repo = client_for(tmp_path)
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["privacy"]["repositoryCodeExecuted"] is False

    valid = client.post("/api/repositories/validate", json={"path": str(repo)})
    assert valid.status_code == 200
    assert valid.json()["authorized"] is True

    outside = client.post("/api/repositories/validate", json={"path": str(tmp_path.parent)})
    assert outside.status_code == 422
    assert "outside" in outside.json()["detail"]


def test_scan_history_and_delete(tmp_path: Path):
    client, repo = client_for(tmp_path)
    response = client.post("/api/scans", json={"path": str(repo)})
    assert response.status_code == 200
    report = response.json()
    assert report["status"] == "completed"
    assert len(report["checks"]) == 8

    history = client.get("/api/history")
    assert history.status_code == 200
    assert history.json()["items"][0]["id"] == report["id"]

    deleted = client.delete(f"/api/history/{report['id']}")
    assert deleted.status_code == 200
    assert client.get(f"/api/scans/{report['id']}").status_code == 404


def test_briefing_uses_real_report_and_validates_model_output(tmp_path: Path):
    client, repo = client_for(tmp_path)
    report = client.post("/api/scans", json={"path": str(repo)}).json()
    model_response = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "headline": "Keep the clone boring",
                    "summary": "The scan is healthy. Keep the evidence easy to repeat.",
                    "actions": [{
                        "check_id": "git_history",
                        "action": "Keep the history easy to inspect",
                        "why": "The scan verified Git history.",
                        "effort": "low",
                    }],
                })
            }
        }]
    }
    # The API calls chat_json directly and expects the parsed JSON object.
    with patch("sloth_briefing_ai.local_ai.chat_json", return_value=json.loads(model_response["choices"][0]["message"]["content"])):
        response = client.post(f"/api/scans/{report['id']}/briefing")
    assert response.status_code == 200
    assert response.json()["briefing"]["actions"][0]["check_id"] == "git_history"


def test_settings_reject_remote_endpoint(tmp_path: Path):
    client, _ = client_for(tmp_path)
    response = client.put("/api/settings", json={"endpoint": "https://example.com/v1/chat/completions", "model": "qwen2.5:3b", "timeout": 30})
    assert response.status_code == 422
