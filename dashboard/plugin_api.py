"""Skills Manager dashboard plugin — backend API routes.

Mounted at /api/plugins/skills-manager/ by the dashboard plugin system.

Security notes:
- Routes go through the dashboard's session-token auth middleware.
- Only user skills (~/.hermes/skills/) are editable; bundled and external
  skills are read-only.
- Skill mutations reuse skill_manage() from the tool system so cache
  invalidation and curator telemetry are handled automatically.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

try:
    from fastapi import APIRouter, HTTPException
except Exception:  # Allows local unit tests without dashboard dependencies.
    class APIRouter:
        def get(self, *_args, **_kwargs):
            return lambda fn: fn
        def patch(self, *_args, **_kwargs):
            return lambda fn: fn
        def post(self, *_args, **_kwargs):
            return lambda fn: fn
        def delete(self, *_args, **_kwargs):
            return lambda fn: fn

    class HTTPException(Exception):
        def __init__(self, status_code=400, detail=""):
            self.status_code = status_code
            self.detail = detail

try:
    from hermes_constants import get_hermes_home, get_skills_dir
except Exception:
    import os as _os

    def get_hermes_home() -> Path:
        val = (_os.environ.get("HERMES_HOME") or "").strip()
        return Path(val) if val else Path.home() / ".hermes"

    def get_skills_dir() -> Path:
        return get_hermes_home() / "skills"

try:
    from agent.skill_utils import get_all_skills_dirs, iter_skill_index_files
except Exception:
    from pathlib import Path

    def get_all_skills_dirs():
        return [get_skills_dir()]

    def iter_skill_index_files(skills_dir, filename):
        if not skills_dir.is_dir():
            return
        for root, _, files in os.walk(skills_dir, followlinks=True):
            for f in files:
                if f == filename:
                    yield Path(root) / f

try:
    from tools.skill_manager_tool import skill_manage
except Exception:
    from typing import Any as _A
    def skill_manage(**_kw: _A) -> str:
        return json.dumps({"success": False, "error": "skill_manage not available"})

try:
    import yaml
    def yaml_load(text):
        return yaml.safe_load(text)
except Exception:
    import json as _json

    def yaml_load(text):
        try:
            return _json.loads(text)
        except Exception:
            return {}

log = logging.getLogger(__name__)
router = APIRouter()

# ── Helpers ─────────────────────────────────────────────────────────────────

_USER_SKILLS_RE = re.compile(r"^" + re.escape(str(Path.home())) + r"[/\\]\.hermes[/\\]skills[/\\]")
_BUNDLED_RE = re.compile(r"[/\\](hermes-agent|plugins|optional-skills)[/\\]skills[/\\]")


def _is_user_skill(skill_path: Path) -> bool:
    """Return True only if the skill lives in ~/.hermes/skills/."""
    return bool(_USER_SKILLS_RE.match(str(skill_path.resolve())))


def _is_bundled(skill_path: Path) -> bool:
    """Return True for skills shipped with the hermes-agent repo."""
    return bool(_BUNDLED_RE.search(str(skill_path.resolve())))


def _parse_skill_meta(skill_path: Path) -> dict[str, Any]:
    """Parse frontmatter from SKILL.md, returning minimal metadata."""
    if not skill_path.exists():
        return {}
    try:
        text = skill_path.read_text(encoding="utf-8")
    except Exception:
        return {}
    # Extract YAML frontmatter
    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        return {"name": skill_path.parent.name, "description": ""}
    try:
        fm = yaml_load(m.group(1))
    except Exception:
        fm = {}
    name = fm.get("name", skill_path.parent.name)
    desc = fm.get("description", "")
    cat = (fm.get("category") or "") if isinstance(fm, dict) else ""
    tags = []
    if isinstance(fm, dict):
        meta = fm.get("metadata", {}) or {}
        hermes = meta.get("hermes", {}) or {}
        tags = hermes.get("tags") or []
    return {
        "name": str(name),
        "description": str(desc),
        "category": str(cat),
        "tags": tags,
        "skill_dir": str(skill_path.parent),
        "skill_path": str(skill_path),
        "pinned": False,  # Pinned state lives in .usage.json; skip for now
        "is_user_skill": _is_user_skill(skill_path),
        "is_bundled": _is_bundled(skill_path),
    }


def _list_skill_files(skill_dir: Path) -> list[dict[str, str]]:
    """Walk a skill dir and return all file paths (relative)."""
    if not skill_dir.is_dir():
        return []
    files = []
    for root, _, filenames in os.walk(skill_dir, followlinks=True):
        for f in filenames:
            if f == ".DS_Store":
                continue
            full = Path(root) / f
            rel = str(full.relative_to(skill_dir))
            files.append({"path": rel, "type": "file"})
    return files


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/skills")
async def list_skills() -> dict[str, Any]:
    """List all installed skills across all skills dirs.

    Returns read-only metadata — use GET /skills/<name> for full content.
    """
    skills: list[dict[str, Any]] = []
    seen: set[str] = set()
    for skills_dir in get_all_skills_dirs():
        for skill_file in iter_skill_index_files(skills_dir, "SKILL.md"):
            skill_dir = skill_file.parent
            # Deduplicate by resolved path
            resolved = str(skill_dir.resolve())
            if resolved in seen:
                continue
            seen.add(resolved)
            meta = _parse_skill_meta(skill_file)
            meta["source"] = (
                "user"
                if _is_user_skill(skill_dir)
                else "bundled"
                if _is_bundled(skill_dir)
                else "external"
            )
            skills.append(meta)
    skills.sort(key=lambda s: s.get("name", ""))
    return {"skills": skills, "total": len(skills)}


@router.get("/skills/{name}")
async def get_skill(name: str) -> dict[str, Any]:
    """Get full content + file list for a named skill.

    Searches all skills dirs; returns first match (user > bundled > external).
    """
    for skills_dir in get_all_skills_dirs():
        for skill_file in iter_skill_index_files(skills_dir, "SKILL.md"):
            if skill_file.parent.name == name:
                skill_dir = skill_file.parent
                meta = _parse_skill_meta(skill_file)
                try:
                    meta["content"] = skill_file.read_text(encoding="utf-8")
                except Exception:
                    meta["content"] = ""
                meta["files"] = _list_skill_files(skill_dir)
                meta["source"] = (
                    "user"
                    if _is_user_skill(skill_dir)
                    else "bundled"
                    if _is_bundled(skill_dir)
                    else "external"
                )
                return meta
    raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")


@router.patch("/skills/{name}")
async def patch_skill(name: str, body: dict[str, Any]) -> dict[str, Any]:
    """Mutate a skill via old_string/new_string patch, or full content edit.

    Body keys:
      - action: "patch" | "edit" | "delete"
      - old_string: text to find (for patch)
      - new_string: replacement (for patch; empty to delete)
      - content: full SKILL.md text (for edit)
      - file_path: path within skill dir (optional; defaults to SKILL.md)
    """
    for skills_dir in get_all_skills_dirs():
        for skill_file in iter_skill_index_files(skills_dir, "SKILL.md"):
            if skill_file.parent.name == name:
                skill_dir = skill_file.parent
                if not _is_user_skill(skill_dir):
                    raise HTTPException(
                        status_code=403,
                        detail="Only user skills (~/.hermes/skills/) can be edited. "
                               "Bundled and external skills are read-only.",
                    )
                action = body.get("action", "patch")
                file_path = body.get("file_path") or None
                result = skill_manage(
                    action=action,
                    name=name,
                    content=body.get("content"),
                    old_string=body.get("old_string"),
                    new_string=body.get("new_string"),
                    file_path=file_path,
                    file_content=body.get("file_content"),
                    replace_all=body.get("replace_all", False),
                    absorbed_into=body.get("absorbed_into"),
                )
                parsed = json.loads(result)
                if not parsed.get("success"):
                    raise HTTPException(status_code=400, detail=parsed.get("error", "Mutation failed"))
                return parsed
    raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")


@router.post("/skills/{name}/files/{path:path}")
async def write_skill_file(name: str, path: str, body: dict[str, str]) -> dict[str, Any]:
    """Create or overwrite a file inside a skill directory.

    file_path must be under references/, templates/, scripts/, or assets/.
    """
    for skills_dir in get_all_skills_dirs():
        for skill_file in iter_skill_index_files(skills_dir, "SKILL.md"):
            if skill_file.parent.name == name:
                skill_dir = skill_file.parent
                if not _is_user_skill(skill_dir):
                    raise HTTPException(
                        status_code=403,
                        detail="Only user skills can be modified.",
                    )
                allowed_prefixes = ("references", "templates", "scripts", "assets")
                if not any(path.startswith(p) for p in allowed_prefixes):
                    raise HTTPException(
                        status_code=400,
                        detail=f"file_path must start with one of {allowed_prefixes}",
                    )
                result = skill_manage(
                    action="write_file",
                    name=name,
                    file_path=path,
                    file_content=body.get("content", ""),
                )
                parsed = json.loads(result)
                if not parsed.get("success"):
                    raise HTTPException(status_code=400, detail=parsed.get("error", "Write failed"))
                return parsed
    raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")


@router.delete("/skills/{name}/files/{path:path}")
async def remove_skill_file(name: str, path: str) -> dict[str, Any]:
    """Delete a file from a skill directory."""
    for skills_dir in get_all_skills_dirs():
        for skill_file in iter_skill_index_files(skills_dir, "SKILL.md"):
            if skill_file.parent.name == name:
                skill_dir = skill_file.parent
                if not _is_user_skill(skill_dir):
                    raise HTTPException(
                        status_code=403,
                        detail="Only user skills can be modified.",
                    )
                result = skill_manage(
                    action="remove_file",
                    name=name,
                    file_path=path,
                )
                parsed = json.loads(result)
                if not parsed.get("success"):
                    raise HTTPException(status_code=400, detail=parsed.get("error", "Delete failed"))
                return parsed
    raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")


@router.get("/skills/{name}/usage")
async def skill_usage(name: str) -> dict[str, Any]:
    """Return curator telemetry for a skill (use_count, patch_count, etc.)."""
    try:
        usage_path = get_skills_dir() / ".usage.json"
        if usage_path.exists():
            data = json.loads(usage_path.read_text(encoding="utf-8"))
            if name in data:
                return data[name]
    except Exception:
        pass
    return {
        "name": name,
        "use_count": 0,
        "view_count": 0,
        "patch_count": 0,
        "last_activity_at": None,
        "state": "unknown",
        "pinned": False,
    }
