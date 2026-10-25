import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import URLError
from unittest.mock import patch

from sloth_briefing_ai.briefing import BriefingValidationError, _validate_briefing, generate
from sloth_briefing_ai.local_ai import LocalAIResponseError, LocalAIUnavailable, chat_json
from sloth_briefing_ai.scanner import audit


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class StandaloneTests(unittest.TestCase):
    def make_repo(self):
        root = Path(tempfile.mkdtemp(prefix="sloth-standalone-"))
        (root / "pyproject.toml").write_text('[project]\nname = "fixture"\n')
        (root / "uv.lock").write_text("version = 1\n")
        (root / ".python-version").write_text("3.12\n")
        (root / "Dockerfile").write_text("FROM python:3.12-slim\n")
        (root / "README.md").write_text("# Fixture\n\n## Setup\ninstall\n\n## Run\nrun\n\n## Test\npytest\n")
        (root / ".env.example").write_text("TOKEN=YOUR_VALUE_HERE\n")
        return root

    def test_scanner_is_standalone_and_returns_eight_checks(self):
        checks = audit(self.make_repo())
        self.assertEqual(len(checks), 8)
        self.assertEqual({check.id for check in checks}, {
            "git_history", "dependency_lockfile", "pinned_runtime", "dockerfile",
            "test_command", "readme", "env_example", "absolute_paths",
        })

    def test_chat_json_uses_open_weight_default_and_parses_response(self):
        response = {"choices": [{"message": {"content": '{"headline":"Ready"}'}}]}
        with patch("sloth_briefing_ai.local_ai.urlopen", return_value=FakeResponse(response)) as open_url:
            result = chat_json(system_prompt="system", user_prompt="user")
        self.assertEqual(result, {"headline": "Ready"})
        body = json.loads(open_url.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(body["model"], "qwen2.5:3b")

    def test_unavailable_model_is_explicit(self):
        with patch("sloth_briefing_ai.local_ai.urlopen", side_effect=URLError("refused")):
            with self.assertRaises(LocalAIUnavailable):
                chat_json(system_prompt="system", user_prompt="user", timeout=0.1)

    def test_invalid_model_json_is_rejected(self):
        response = {"choices": [{"message": {"content": '[1, 2]'}}]}
        with patch("sloth_briefing_ai.local_ai.urlopen", return_value=FakeResponse(response)):
            with self.assertRaises(LocalAIResponseError):
                chat_json(system_prompt="system", user_prompt="user")

    def test_briefing_does_not_send_absolute_path_or_source_contents(self):
        root = self.make_repo()
        response = {"choices": [{"message": {"content": json.dumps({
            "headline": "Calm clone",
            "summary": "Most proof points are present.",
            "actions": [{"check_id": "git_history", "action": "Keep history clear", "why": "Git history passed", "effort": "low"}],
        })}}]}
        with patch("sloth_briefing_ai.local_ai.urlopen", return_value=FakeResponse(response)) as open_url:
            result = generate(root)
        self.assertEqual(result["aiStatus"], "PASS")
        body = open_url.call_args.args[0].data.decode("utf-8")
        self.assertNotIn(str(root), body)
        self.assertNotIn("pyproject.toml", body)

    def test_unknown_check_id_is_rejected(self):
        checks = audit(self.make_repo())
        with self.assertRaises(BriefingValidationError):
            _validate_briefing({
                "headline": "Bad",
                "summary": "Bad evidence.",
                "actions": [{"check_id": "unknown", "action": "Do it", "why": "Because", "effort": "low"}],
            }, checks)


if __name__ == "__main__":
    unittest.main()
