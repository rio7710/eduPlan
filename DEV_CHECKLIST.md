# EduFixer Dev Checklist

Use `d:\OneDrive\Desktop\eduPlan\eduFixer` as the only working root.

## Start Here

- Open the project from `eduFixer`, not from `eduPlan`.
- Read `AGENTS.md` before large edits.
- Treat `_temp` and `_cf` folders outside this repo as reference only.

## Main Folders

- `src/`: React UI and hooks
- `electron/`: Electron main process, IPC handlers, shared runtime
- `scripts/`: Python helper scripts
- `tools/`: local dev launch helpers
- `docs/`: internal project docs

## Environment

- Node dependencies: `node_modules/`
- Python environment: `.venv/`
- Install Python packages with:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Daily Commands

```powershell
npm run dev
npm run lint
npm run typecheck
npm run test
```

## Change Policy

- Prefer small fixes over broad refactors.
- Do not mix structural refactor and feature work in one pass.
- Do not edit moved reference files in `_temp`.
- Keep Electron, Python runner, and editor-sync boundaries stable unless fixing a concrete bug.
- Follow `docs/render-policy.md` when touching preview, menu, location, or editor sync behavior.

## Release Policy

- Real build and release work happens from this folder only.
- Old outputs moved to `_temp` are reference snapshots, not active release artifacts.

## If Unsure

- If a file is not inside `eduFixer`, assume it is not part of the active app unless explicitly needed for reference.
