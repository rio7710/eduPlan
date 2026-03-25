# EduFixer Working Guide

Use `d:\OneDrive\Desktop\eduPlan\eduFixer` as the only project root.

## Core Rules

- Prefer targeted fixes over broad refactors.
- Do not mix structure changes with feature changes in the same task unless the user explicitly asks for both.
- Preserve existing Electron, IPC, Python runner, and editor-sync boundaries unless a bug requires changing them.
- Do not move or rename files just to improve aesthetics.
- Keep changes local to the module that owns the behavior.
- Keep files small enough to reason about quickly. Avoid pushing a file much past 200 lines unless the existing file is already larger and a narrow fix is safer.
- Split new logic by responsibility before a file becomes hard to scan. Selection rules, clipboard rules, render rules, and sync rules must not be merged into one large module.
- Respect existing user edits. Never revert unrelated dirty files.

## Project Boundaries

- `src/`: React UI, hooks, store, and view logic.
- `electron/handlers/`: IPC entry points and orchestration.
- `electron/lib/`: shared runtime helpers, database utilities, and Python execution.
- `scripts/`: Python helper scripts invoked by Electron.
- `docs/`: project notes and internal references, not runtime code.

## Render Policy

- Follow `docs/render-policy.md` for render and navigation behavior.
- Full render is allowed only on initial load, refresh, document change, or content change.
- Navigation-only updates must not trigger full render.
- Search result clicks must move to the target line without forcing unrelated full render work.
- Search highlighting should prefer exact text-range highlight over whole-block highlight when the target text is known.

## File Session Rules

- A file opened for the first time should start in `render` mode.
- Reopening or reselecting an already-tracked file should restore that file's last editor mode and line.
- Closing a document tab must clear that file's stored editor session so the next open starts fresh.

## Python Rules

- Use `.\.venv\Scripts\python.exe` from this repo when running Python locally.
- Install Python dependencies with `python -m pip install -r requirements.txt`.
- Prefer `python -m pip` over bare `pip`.
- Do not assume global Python or global packages are valid for this repo.

## Formatting And Validation

- Run `npm run lint` before large edits when possible.
- Run `npm run typecheck` after TypeScript changes when possible.
- Run `npm run format` only on files touched for the current task.
- Treat existing lint debt as separate from the current task unless the user asks to clean it up.

## Edit Style

- Keep imports stable and avoid churn.
- Keep functions and hooks in their current ownership area unless there is a concrete defect.
- Prefer functions around 40 to 60 lines when practical.
- If a change would add another large branch of logic to a file, extract it into a nearby helper, hook, or utility first.
- Add comments only when the logic is non-obvious.
- Use ASCII by default.

## Decision Policy

- If a request suggests a broad refactor, stop and ask whether the user wants a narrow fix instead.
- If a task can be solved with a small patch, choose the small patch.
- If validation fails because of unrelated existing issues, report that clearly without expanding scope.
