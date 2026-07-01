# PR 786 Release Hardening Receipt

Date: 2026-06-26
Worktree: `/Users/marklindgreen/.git-worktrees/rox/team/pr786-release-hardening`
Branch: `team/pr786-release-hardening`
PR: `https://github.com/agisota/rox/pull/786`

## Current State X

The lane is a clean, independent worktree at `3054642e743e7f1b358fc6c30155159fa88d17e7`.

Evidence:

- `git status --porcelain=v1 --branch` -> `## team/pr786-release-hardening`
- `git log --oneline --decorate -n 5` -> `3054642e7 (HEAD -> team/pr786-release-hardening, origin/codex/rox-packaged-ux-release-20260626, ...) Make PR 786 release checks deterministic`
- `df -h .` -> `/System/Volumes/Data` has `224Mi` available and is at `100%` capacity.
- `du -sh . apps/desktop` -> worktree `602M`, desktop app `33M`.
- `find apps/desktop/release ...` -> `apps/desktop/release` does not exist.
- `/Applications/Rox.app` exists and reports `CFBundleShortVersionString=2.2.0`, but this installed app is not proof for this worktree because no artifact was built from this checkout.

PR #786 live state from read-only GitHub lookup:

- `gh pr view 786 --repo agisota/rox --json ...` -> open PR, head branch `codex/rox-packaged-ux-release-20260626`, head SHA `3054642e743e7f1b358fc6c30155159fa88d17e7`, base `main`, `mergeStateStatus=DIRTY`.
- `gh pr checks 786 --repo agisota/rox --watch=false` -> exit code `8`; `CodeRabbit` is pending and `cubic - AI code reviewer` is neutral/skipping.

## Target State Y

Release-ready state requires more than source inspection:

- PR #786 must be mergeable against `main`.
- Required PR checks must be complete and green or explicitly accepted as non-blocking.
- Desktop package proof must come from artifacts built from the PR head or an approved workflow run for the same SHA.
- Downloadable/installable proof must include actual release artifacts, update manifests, checksums or GitHub release asset evidence, and packaged runtime checks.
- macOS signing/notarization truth must stay separate from ad-hoc package truth.

## Gap / Transformation

This worktree can only produce a release-hardening receipt right now. It cannot produce packaged proof because local disk has only `224Mi` free while desktop packaging declares a `4g` DMG allocation and also needs build intermediates, native-module rebuilds, zips, manifests, and app bundle output.

Transformation required:

- Resolve PR mergeability (`mergeStateStatus=DIRTY`) before claiming release readiness.
- Let GitHub Actions or a machine with enough disk run the package workflow for SHA `3054642e743e7f1b358fc6c30155159fa88d17e7`.
- Verify the resulting `.dmg`, `.zip`, `.AppImage`, updater manifests, app bundle contents, and release assets from the workflow outputs or final GitHub release.
- If macOS certificate secrets are absent, treat the macOS build as ad-hoc signed and not notarized; do not call it trust-installable without the explicit quarantine/Gatekeeper caveat.

## Commands / Evidence

Read-only or low-disk commands run:

```bash
git status --short --branch
git rev-parse HEAD
git log --oneline --decorate -n 5
git remote -v
df -h .
du -sh . apps/desktop
jq '.scripts' package.json
jq '.scripts' apps/desktop/package.json
jq '{name, version, productName, packageManager, description}' package.json
jq '{name, version, productName, description, main, author, resources}' apps/desktop/package.json
sed -n '1,240p' apps/desktop/electron-builder.ts
sed -n '1,220p' apps/desktop/electron-builder.canary.ts
sed -n '1,260p' apps/desktop/create-release.sh
sed -n '260,570p' apps/desktop/create-release.sh
sed -n '1,520p' .github/workflows/build-desktop.yml
sed -n '1,220p' .github/workflows/release-desktop.yml
sed -n '1,140p' .github/workflows/publish-existing-desktop.yml
sed -n '1,290p' .github/workflows/ci.yml
find apps/desktop/release -maxdepth 3 -mindepth 1 -print
find apps/desktop -maxdepth 4 -name '*.dmg' -print -o -name '*.zip' -print -o -name '*.AppImage' -print -o -name 'latest*.yml' -print -o -name '*.app' -print
plutil -extract CFBundleShortVersionString raw /Applications/Rox.app/Contents/Info.plist
gh pr view 786 --repo agisota/rox --json number,title,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,statusCheckRollup,url
gh pr checks 786 --repo agisota/rox --watch=false
```

Package and release surfaces inspected:

- Root `package.json` uses `bun@1.3.14`; root `build` is `turbo build --filter=@rox/desktop`; root `release:desktop` is `./apps/desktop/create-release.sh`.
- `apps/desktop/package.json` version is `2.2.0`; desktop `prebuild` runs catalog, icons, `electron-vite`, CLI bundle, native-module copy, and native-runtime validation.
- Desktop `build` runs `cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --publish never`.
- Desktop `package` runs `electron-builder --config electron-builder.ts`.
- Desktop `release` runs `electron-builder --publish always`.
- `apps/desktop/electron-builder.ts` outputs to `apps/desktop/release`, generates update files for all channels, publishes to GitHub `agisota/rox`, and sets `dmg.size: "4g"`.
- macOS config enables hardened runtime only when `CSC_LINK` exists, otherwise uses ad-hoc `identity: "-"`; notarization depends on `APPLE_TEAM_ID`.
- `build-desktop.yml` builds macOS arm64/x64, Linux x64, and Windows x64; Windows is `continue-on-error: true`.
- macOS workflow gates include app bundle existence, `app-update.yml`, bundled CLI executable, DuckDB native binding presence, DMG upload, ZIP upload, and `*-mac.yml` upload.
- Linux workflow gates include AppImage, `*-linux.yml`, and bundled CLI executable.
- `release-desktop.yml` publishes downloaded workflow artifacts, creates stable latest-download filenames, appends unsigned macOS install notes, and creates the GitHub release.
- `publish-existing-desktop.yml` can publish already-built artifacts without rebuilding locally.

## Packaged-Proof Blocker

Packaged proof is blocked locally.

Reasons:

- Free space is `224Mi`, below the configured `4g` DMG allocation and below expected build/package temporary output needs.
- `apps/desktop/release` does not exist in this worktree.
- Heavy build/package/zip/DMG tasks were explicitly out of scope for this lane.
- Signing/notarization secrets were not loaded or tested in this receipt lane.
- Existing `/Applications/Rox.app` version `2.2.0` is installed runtime evidence only; it is not a downloadable/installable artifact built from this worktree.

## Release-Hardening Risks

- PR #786 is not currently merge-ready because GitHub reports `mergeStateStatus=DIRTY`.
- Checks are not currently green because `CodeRabbit` is pending; `gh pr checks` returned exit code `8`.
- Local package proof is impossible until disk is freed or CI artifacts for the same SHA are used.
- If `MAC_CERTIFICATE` is absent in CI, macOS output is ad-hoc signed and not notarized; release notes must retain the unsigned/quarantine caveat.
- Windows package failure does not block the reusable desktop release workflow today; this is intentional in `build-desktop.yml`, but it means a red Windows leg can coexist with a macOS/Linux release.

## Verification Proof Needed Later

Given current state X and target state Y:

- Given PR #786 is `DIRTY`, resolve the merge conflict against `main` so GitHub reports the PR mergeable.
- Given checks are pending, wait for or rerun PR checks so required checks report success.
- Given local disk blocks packaging, use GitHub Actions `build-desktop.yml` or `release-desktop.yml` for SHA `3054642e743e7f1b358fc6c30155159fa88d17e7` so artifacts are built off the exact PR head.
- Given artifacts are required, verify DMG, ZIP, AppImage, update manifests, app bundle `app-update.yml`, bundled `rox` CLI, DuckDB native bindings, release asset URLs, and checksums before claiming the release downloadable/installable.
