"""Deterministic, non-executing repository evidence scanner."""

from __future__ import annotations

import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path


PASS = "PASS"
FAIL = "FAIL"
WARN = "WARN"
SKIPPED = "SKIPPED"
UNSUPPORTED = "UNSUPPORTED"

TEXT_EXTENSIONS = {
    ".cfg",
    ".env",
    ".example",
    ".ini",
    ".js",
    ".json",
    ".md",
    ".py",
    ".sh",
    ".toml",
    ".ts",
    ".txt",
    ".yaml",
    ".yml",
}
EXCLUDED_PARTS = {
    ".git",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
    ".sloth-data",
}


@dataclass(frozen=True)
class Check:
    id: str
    name: str
    status: str
    explanation: str
    evidence: list[str]
    remediation: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _run(args: list[str], cwd: Path, timeout: float = 10) -> tuple[int | None, str]:
    try:
        process = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return None, "tool not installed"
    except subprocess.TimeoutExpired:
        return 124, "command timed out"
    except OSError as exc:
        return 125, str(exc)
    return process.returncode, (process.stdout + process.stderr).strip()


def _files(root: Path):
    for path in root.rglob("*"):
        try:
            relative = path.relative_to(root)
        except ValueError:
            continue
        if any(part in EXCLUDED_PARTS for part in relative.parts):
            continue
        if path.is_symlink() or not path.is_file():
            continue
        if path.suffix.lower() in TEXT_EXTENSIONS or path.name in {"Dockerfile", "Makefile", "Procfile"}:
            yield path


def _manifest(root: Path) -> tuple[list[str] | None, list[str]]:
    manifest_locks = {
        "pyproject.toml": ("uv.lock", "poetry.lock", "Pipfile.lock"),
        "package.json": ("package-lock.json", "yarn.lock", "pnpm-lock.yaml"),
        "Cargo.toml": ("Cargo.lock",),
        "go.mod": ("go.sum",),
    }
    manifests = [name for name in manifest_locks if (root / name).is_file()]
    if not manifests and (root / "requirements.txt").is_file():
        return ["requirements.txt"], []
    locks = [lock for manifest in manifests for lock in manifest_locks[manifest] if (root / lock).is_file()]
    return (manifests or None), locks


def git_history(root: Path) -> Check:
    status, output = _run(["git", "rev-parse", "--is-inside-work-tree"], root)
    if status is None:
        return Check("git_history", "Git history", UNSUPPORTED, "Git is not installed.", [], "Install Git and initialize a repository.")
    if status:
        return Check("git_history", "Git history", FAIL, "The target is not a Git work tree.", [], "Run git init and create at least one commit.")
    count_status, count = _run(["git", "rev-list", "--count", "HEAD"], root)
    if count_status == 0 and count.isdigit() and int(count) > 0:
        return Check("git_history", "Git history", PASS, "Git history contains at least one commit.", [f"{count} commit(s)"], "")
    return Check("git_history", "Git history", FAIL, "Git metadata exists but no commit is available.", [count], "Create an initial commit.")


def dependency_lockfile(root: Path) -> Check:
    manifests, locks = _manifest(root)
    if manifests is None:
        return Check("dependency_lockfile", "Dependency lockfile", UNSUPPORTED, "No recognized package manifest was found.", [], "Add a supported manifest and its ecosystem lockfile.")
    if locks:
        return Check("dependency_lockfile", "Dependency lockfile", PASS, "A lockfile matches a detected package manifest.", locks, "")
    return Check("dependency_lockfile", "Dependency lockfile", FAIL, "A recognized manifest has no matching lockfile.", manifests, "Generate and commit the ecosystem-appropriate lockfile.")


def pinned_runtime(root: Path) -> Check:
    candidates = [".python-version", ".nvmrc", ".node-version", "rust-toolchain.toml", ".tool-versions", "go.mod"]
    found = [name for name in candidates if (root / name).is_file() and (root / name).read_text(errors="replace").strip()]
    if found:
        return Check("pinned_runtime", "Pinned runtime", PASS, "An explicit runtime configuration was found.", found, "")
    return Check("pinned_runtime", "Pinned runtime", FAIL, "No explicit runtime version was detected.", [], "Commit a runtime pin such as .python-version.")


def dockerfile(root: Path) -> Check:
    path = root / "Dockerfile"
    if path.is_file() and path.stat().st_size:
        return Check("dockerfile", "Dockerfile", PASS, "A non-empty Dockerfile is present.", ["Dockerfile"], "")
    return Check("dockerfile", "Dockerfile", FAIL, "No usable Dockerfile was found.", [], "Add a minimal reproducible Dockerfile.")


def test_command(root: Path) -> Check:
    evidence: list[str] = []
    readme = root / "README.md"
    text = readme.read_text(errors="replace") if readme.is_file() else ""
    if re.search(r"(?im)^\s*(?:\$\s*)?(?:python(?:3)?\s+-m\s+unittest|pytest|npm\s+test|cargo\s+test|go\s+test)", text):
        evidence.append("README.md")
    if (root / "tests").is_dir() or (root / "test").is_dir():
        evidence.append("tests/ directory")
    if evidence:
        return Check("test_command", "Test command", PASS, "A test command or test suite is identifiable.", evidence, "")
    return Check("test_command", "Test command", WARN, "No documented or clearly identifiable test command was found.", [], "Document the exact test command in README.md.")


def readme(root: Path) -> Check:
    path = root / "README.md"
    if not path.is_file():
        return Check("readme", "README", FAIL, "README.md is missing.", [], "Add setup, run, and test instructions.")
    text = path.read_text(errors="replace")
    sections = [section for section in ("setup", "install", "run", "test") if re.search(rf"(?im)^#+\s*.*{section}", text)]
    if len(text.strip()) >= 120 and {"setup", "run", "test"}.issubset(sections):
        return Check("readme", "README", PASS, "README contains meaningful setup, run, and test sections.", sections, "")
    return Check("readme", "README", FAIL, "README is missing meaningful setup, run, or test instructions.", sections, "Document setup, run, and test workflows.")


def env_example(root: Path) -> Check:
    path = root / ".env.example"
    if not path.is_file():
        return Check("env_example", ".env.example", WARN, "No environment example was found; this is only a failure when configuration is required.", [], "Add .env.example with placeholders if configuration is needed.")
    hits: list[str] = []
    for line_number, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
        if re.search(r"(?i)(sk-[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{12,}|-----BEGIN|password\s*=\s*[^$<{][^\s]+|secret\s*=\s*[^$<{][^\s]+)", line):
            hits.append(f".env.example:{line_number}")
    if hits:
        return Check("env_example", ".env.example", FAIL, "The example file contains a secret-like value; values are not printed.", hits, "Replace values with placeholders and rotate exposed credentials.")
    return Check("env_example", ".env.example", PASS, "An example environment file contains no obvious secret-like values.", [".env.example"], "")


def absolute_paths(root: Path) -> Check:
    hits: list[str] = []
    pattern = re.compile(r"(?:/home/[^\s'\"`]+|/Users/[^\s'\"`]+|[A-Za-z]:\\Users\\[^\s'\"`]+)")
    for path in _files(root):
        try:
            lines = path.read_text(errors="replace").splitlines()
        except OSError:
            continue
        for line_number, line in enumerate(lines, 1):
            normalized = line.replace("\\\\", "\\")
            if pattern.search(normalized) and "http://" not in line and "https://" not in line and "re.compile" not in line and "pattern =" not in line:
                hits.append(f"{path.relative_to(root)}:{line_number}")
    if hits:
        return Check("absolute_paths", "Absolute local paths", WARN, "Possible machine-specific absolute paths were found; heuristics can over-report.", hits[:20], "Use relative paths or environment-based configuration.")
    return Check("absolute_paths", "Absolute local paths", PASS, "No likely machine-specific absolute paths were found.", [], "")


def audit(root: Path) -> list[Check]:
    return [
        git_history(root),
        dependency_lockfile(root),
        pinned_runtime(root),
        dockerfile(root),
        test_command(root),
        readme(root),
        env_example(root),
        absolute_paths(root),
    ]


def summary(checks: list[Check]) -> dict[str, int]:
    return {status: sum(check.status == status for check in checks) for status in (PASS, FAIL, WARN, SKIPPED, UNSUPPORTED)}
