"""Evidence-backed Sloth Briefing orchestration."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .local_ai import LocalAIConfig, LocalAIError, chat_json
from .scanner import Check, FAIL, audit, summary


SYSTEM_PROMPT = """You are Sloth Briefing, a careful local developer assistant.
The user will provide deterministic repository scan results. Treat those
results as the only source of truth. Do not invent files, commands, evidence,
or statuses. Recommend the smallest useful next steps and reward lazy,
low-effort maintenance.

Return JSON only with this exact shape:
{
  "headline": "short title",
  "summary": "two concise sentences",
  "actions": [
    {"check_id": "known check id", "action": "small next step", "why": "evidence-based reason", "effort": "low"}
  ]
}

Use at most three actions. Every check_id must be one of the supplied IDs.
Prefer actions for FAIL checks, then WARN checks. Keep all strings concise and
do not include secrets.
"""


class BriefingValidationError(RuntimeError):
    """The local model produced a briefing that cannot be trusted."""


def _text(value: object, field: str, *, max_length: int = 500) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BriefingValidationError(f"The briefing field {field!r} must be non-empty text.")
    return value.strip()[:max_length]


def _validate_briefing(value: dict[str, object], checks: list[Check]) -> dict[str, object]:
    known_ids = {check.id for check in checks}
    result = {
        "headline": _text(value.get("headline"), "headline", max_length=120),
        "summary": _text(value.get("summary"), "summary"),
        "actions": [],
    }
    raw_actions = value.get("actions")
    if not isinstance(raw_actions, list):
        raise BriefingValidationError("The briefing actions field must be a list.")
    actions: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw_action in raw_actions[:3]:
        if not isinstance(raw_action, dict):
            raise BriefingValidationError("The briefing contains an invalid action.")
        check_id = _text(raw_action.get("check_id"), "action.check_id", max_length=80)
        if check_id not in known_ids:
            raise BriefingValidationError(f"The briefing referenced an unknown check: {check_id}.")
        if check_id in seen:
            continue
        seen.add(check_id)
        effort = _text(raw_action.get("effort", "low"), "action.effort", max_length=20).lower()
        if effort not in {"low", "medium", "high"}:
            effort = "low"
        actions.append(
            {
                "check_id": check_id,
                "action": _text(raw_action.get("action"), "action.action"),
                "why": _text(raw_action.get("why"), "action.why"),
                "effort": effort,
            }
        )
    result["actions"] = actions
    return result


def _payload(root: Path, checks: list[Check]) -> dict[str, Any]:
    return {
        "repository": root.name or "repository",
        "summary": summary(checks),
        "checks": [check.to_dict() for check in checks],
    }


def scan_result(root: Path) -> dict[str, Any]:
    checks = audit(root)
    payload = _payload(root, checks)
    return {
        "repository": str(root),
        "repositoryName": payload["repository"],
        "summary": payload["summary"],
        "checks": payload["checks"],
    }


def generate(root: Path, *, endpoint: str | None = None, model: str | None = None, timeout: float | None = None) -> dict[str, Any]:
    checks = audit(root)
    payload = _payload(root, checks)
    config = LocalAIConfig.from_environment(endpoint=endpoint, model=model, timeout=timeout)
    model_result = chat_json(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=json.dumps(payload, ensure_ascii=False),
        endpoint=config.endpoint,
        model=config.model,
        timeout=config.timeout,
    )
    return {
        "repository": str(root),
        "repositoryName": payload["repository"],
        "summary": payload["summary"],
        "checks": payload["checks"],
        "briefing": _validate_briefing(model_result, checks),
        "model": config.model,
        "aiStatus": "PASS",
    }


def render(result: dict[str, Any]) -> str:
    briefing = result["briefing"]
    counts = result["summary"]
    lines = [
        "SLOTH BRIEFING",
        f"Repository: {result['repositoryName']}",
        f"Model: {result['model']}",
        f"Audit: {counts['PASS']} PASS | {counts['FAIL']} FAIL | {counts['WARN']} WARN",
        "",
        str(briefing["headline"]),
        str(briefing["summary"]),
    ]
    actions = briefing.get("actions", [])
    if actions:
        lines.extend(["", "LOW-EFFORT NEXT STEPS"])
        for index, action in enumerate(actions, 1):
            lines.append(f"{index}. [{action['effort']}] {action['action']} ({action['check_id']})")
            lines.append(f"   Why: {action['why']}")
    else:
        lines.extend(["", "No additional action was recommended."])
    return "\n".join(lines)


def render_scan(result: dict[str, Any]) -> str:
    counts = result["summary"]
    lines = [
        "SLOTH REPOSITORY SCAN",
        f"Repository: {result['repositoryName']}",
        f"Result: {counts['PASS']} PASS | {counts['FAIL']} FAIL | {counts['WARN']} WARN",
        "",
    ]
    for check in result["checks"]:
        lines.append(f"{check['status']:11} {check['name']}")
        if check["status"] in {"FAIL", "WARN"}:
            lines.append(f"  Next: {check['remediation']}")
    return "\n".join(lines)


def _path_arg(value: str) -> Path:
    path = Path(value).expanduser().resolve()
    if not path.is_dir():
        raise argparse.ArgumentTypeError(f"repository path is not a directory: {value}")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sloth-briefing-ai", description="Generate a local AI repository briefing.")
    parser.add_argument("path", type=_path_arg)
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--endpoint", default=None, help="local OpenAI-compatible endpoint")
    parser.add_argument("--model", default=None, help="local model name")
    parser.add_argument("--timeout", type=float, default=None, help="local model timeout in seconds")
    parser.add_argument("--scan-only", action="store_true", help="run deterministic checks without contacting a local model")
    args = parser.parse_args(argv)
    if args.scan_only:
        result = scan_result(args.path)
        print(json.dumps(result, indent=2) if args.format == "json" else render_scan(result))
        return 1 if result["summary"][FAIL] else 0
    try:
        result = generate(args.path, endpoint=args.endpoint, model=args.model, timeout=args.timeout)
    except LocalAIError as exc:
        output = {"repository": str(args.path), "aiStatus": "UNAVAILABLE", "error": str(exc)}
        if args.format == "json":
            print(json.dumps(output, indent=2))
        else:
            print(f"SLOTH BRIEFING\nAI UNAVAILABLE: {exc}", file=sys.stderr)
        return 2
    except BriefingValidationError as exc:
        output = {"repository": str(args.path), "aiStatus": "INVALID", "error": str(exc)}
        if args.format == "json":
            print(json.dumps(output, indent=2))
        else:
            print(f"SLOTH BRIEFING\nINVALID MODEL OUTPUT: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2) if args.format == "json" else render(result))
    return 0
