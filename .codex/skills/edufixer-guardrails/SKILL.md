---
name: edufixer-guardrails
description: Apply EduFixer-specific working rules, formatting standards, and low-risk change policy. Use when Codex works inside the eduFixer repository for bug fixes, feature edits, lint or type cleanup, Python script updates, or any task where broad refactors should be avoided and repository boundaries must be preserved.
---

# EduFixer Guardrails

Use this skill together with the repository `AGENTS.md`.

## Priority 0 Rules

1. Keep every document, code file, skill file, agent guide, and lint-related rule file at 200 lines or fewer when practical.
2. If a file would exceed 200 lines, split it and manage it through a short index file.
3. If a decision is ambiguous and the safer choice is not obvious from repo context, stop and ask the user before deciding.

## Workflow

1. Read `AGENTS.md` at the repo root before editing.
2. Treat `eduFixer` as the only project root.
3. Choose the smallest patch that solves the requested problem.
4. Avoid broad refactors unless the user explicitly asks for them.
5. Validate only the area you changed, and report unrelated existing failures separately.

## Repository Boundaries

- Keep React UI work inside `src/`.
- Keep IPC entry points inside `electron/handlers/`.
- Keep shared runtime and Python launch logic inside `electron/lib/`.
- Keep Python helper logic inside `scripts/`.
- Do not move files between these areas unless the task is explicitly architectural.

## Python Environment

- Prefer `.\.venv\Scripts\python.exe`.
- Install dependencies from `requirements.txt`.
- Prefer `python -m pip` instead of bare `pip`.
- If Python execution fails, inspect the repo-local environment before changing code.

## Formatting And Validation

- Use the repo formatting config.
- Prefer running `npm run format` on touched files only.
- Run `npm run lint` and `npm run typecheck` when the changed area makes that reasonable.
- Do not expand scope just to clean unrelated lint debt.

## Decision Rules

- If the request is ambiguous between "fix" and "refactor", choose "fix".
- If a change would rename, move, or split many files, pause and confirm first.
- If validation fails due to pre-existing issues, report the exact failure and continue with scoped verification.

## References

- Read `references/rules.md` for the compact checklist when you need the exact guardrails again during work.
