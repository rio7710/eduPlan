# EduFixer Rules

## Quick Checklist

- Priority 0: keep docs, code, skills, agent guides, and lint-related rule files at 200 lines or fewer when practical.
- Priority 0: if a file would exceed 200 lines, split it and manage it through an index file.
- Priority 0: if the safe choice is ambiguous, ask the user before deciding.
- Start from the repo root `eduFixer`.
- Read `AGENTS.md` before substantial edits.
- Prefer the smallest working patch.
- Avoid cross-layer refactors unless explicitly requested.
- Keep Python execution pinned to `.venv`.
- Use formatter and validation tools without widening scope.
- Report unrelated lint or type debt separately.
