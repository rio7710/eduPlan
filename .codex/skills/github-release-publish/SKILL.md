---
name: github-release-publish
description: Publish EduFixer patch releases to GitHub and verify web download plus electron-updater assets. Use when the user asks to upload a new version, make a web download link, publish a GitHub release, push a patch, create a release tag, or make auto-update available.
---

# GitHub Release Publish

Use this with `edufixer-guardrails`. Keep the work scoped to release plumbing unless the user explicitly asks for feature changes.

## Release Flow

1. Check `git status --short` and identify unrelated dirty files.
2. Confirm the app version in `package.json` and `package-lock.json` is higher than the current released version.
3. Run focused validation before publishing:
   - `node --check electron/main.cjs` when Electron main changed.
   - `npm run typecheck`.
   - `npm run build`.
   - `npx electron-builder --win nsis --config.win.signAndEditExecutable=false --publish never` when installer or updater settings changed.
4. Stage only release-related files. Do not stage temp folders or unrelated edits.
5. Commit with a short release message, for example `Release 0.1.10`.
6. Create a matching tag, for example `git tag v0.1.10`.
7. Push `main`, then push the tag:
   - `git push origin main`
   - `git push origin v0.1.10`
8. Verify the tag workflow finishes successfully.
9. Verify release assets include:
   - `edufixer-Setup-<version>.exe`
   - `edufixer-Setup-<version>.exe.blockmap`
   - `latest.yml`
10. Give the user the release page and direct installer URL.

## Auto-Update Requirements

- GitHub Release must contain `latest.yml`; electron-updater uses it to discover the new version.
- The installer file name in `latest.yml` must match the uploaded exe asset.
- Do not reuse an existing version number. Same-version builds will not trigger an update.
- Keep `build.publish` pointed at `rio7710/eduPlan`.
- For Windows NSIS updates, keep installation identity stable:
  - Do not change `appId`.
  - Do not rename `name` casually.
  - Keep install path selection disabled unless the user asks otherwise.

## Verification Commands

Use GitHub API when the `gh` CLI is unavailable:

```powershell
Invoke-RestMethod -Uri https://api.github.com/repos/rio7710/eduPlan/actions/runs?per_page=5
Invoke-RestMethod -Uri https://api.github.com/repos/rio7710/eduPlan/releases/tags/v0.1.10
```

The direct download URL pattern is:

```text
https://github.com/rio7710/eduPlan/releases/download/v<version>/edufixer-Setup-<version>.exe
```

## Failure Handling

- If `git add`, `git tag`, or builder cleanup fails with permission errors, retry with approved escalation rather than changing files.
- If the tag workflow fails, inspect the Actions job before retrying.
- If release assets are missing right after success, wait briefly and query the release API again.
- If validation fails from unrelated lint/build debt, report it without broad cleanup.
