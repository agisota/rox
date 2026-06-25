# Desktop App Release Process

## Quick Start

From the monorepo root:

```bash
./apps/desktop/create-release.sh
```

The script will:
1. Show current version and prompt for new version (patch/minor/major/custom)
2. Update `package.json` version
3. Create and push a `desktop-v<version>` tag
4. Monitor the GitHub Actions build
5. Create a **draft release** for review

### Options

```bash
# Interactive version selection (recommended)
./apps/desktop/create-release.sh

# Explicit version
./apps/desktop/create-release.sh 0.0.50

# Auto-publish (skip draft)
./apps/desktop/create-release.sh --publish
./apps/desktop/create-release.sh 0.0.50 --publish
```

To publish a draft:

```bash
gh release edit desktop-v0.0.50 --draft=false
```

### Requirements

- GitHub CLI (`gh`) installed and authenticated
- Clean git working directory

## Installing the unsigned macOS build

Release builds are currently **ad-hoc signed but not Apple-notarized**
(electron-builder runs with `CSC_IDENTITY_AUTO_DISCOVERY=false` when no
`MAC_CERTIFICATE` secret is present — see [Code Signing](#code-signing)).
Because the `.dmg` is downloaded from GitHub, macOS attaches a
`com.apple.quarantine` extended attribute to it, and Gatekeeper refuses to open
the app with a message like *"Rox.app is damaged and can't be opened"* or
*"cannot be opened because the developer cannot be verified"*.

This is expected for an unsigned build — the app is not actually damaged.
Remove the quarantine attribute **once** after installing:

```bash
# After dragging Rox.app into /Applications:
xattr -dr com.apple.quarantine /Applications/Rox.app
```

If you are running the app straight from the mounted `.dmg` (before copying it
to `/Applications`), point `xattr` at the mounted app instead:

```bash
xattr -dr com.apple.quarantine "/Volumes/Rox/Rox.app"
```

`xattr -dr` recursively (`-r`) deletes (`-d`) the `com.apple.quarantine`
attribute from the app bundle, which is what tells Gatekeeper to stop blocking
it. You only need to do this once per installed copy; auto-updates of an
already-unquarantined app are not re-quarantined.

> Once the macOS build is properly code-signed and notarized (see
> [Code Signing](#code-signing)), this step is no longer required and can be
> dropped from the install instructions.

## Manual Release

If you prefer not to use the script:

```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

This creates a draft release. Publish it manually at GitHub Releases.

## Auto-update

The app checks for updates at launch and every x hours using:

- **macOS manifest**: `https://github.com/agisota/rox/releases/latest/download/latest-mac.yml`
- **Linux manifest**: `https://github.com/agisota/rox/releases/latest/download/latest-linux.yml`
- **macOS installer**: `https://github.com/agisota/rox/releases/latest/download/Rox-arm64.dmg`
- **Linux installer**: `https://github.com/agisota/rox/releases/latest/download/Rox-x64.AppImage`

The workflow creates stable-named copies (without version) so these URLs always point to the latest build.

## Code Signing

macOS code signing uses these repository secrets:

- `MAC_CERTIFICATE` / `MAC_CERTIFICATE_PASSWORD`
- `APPLE_ID` / `APPLE_ID_PASSWORD` / `APPLE_TEAM_ID`

When `MAC_CERTIFICATE` is **not** configured, the build job sets
`CSC_IDENTITY_AUTO_DISCOVERY=false` and electron-builder produces an
**unsigned (ad-hoc signed)** `.dmg`. Downloaded unsigned builds are
Gatekeeper-quarantined — end users must run the `xattr` unquarantine command
documented in
[Installing the unsigned macOS build](#installing-the-unsigned-macos-build).

## Local Testing

```bash
cd apps/desktop
bun run clean:dev
bun run compile:app
bun run package
```

Output: `apps/desktop/release/`

Linux output should include:

- `*.AppImage`
- `*-linux.yml` (auto-update manifest)

## Troubleshooting

- **Linux auto-update not working**: Verify `release/*-linux.yml` is uploaded to the GitHub release
- **Build icon warnings/failures**: Add icons under `src/resources/build/icons/` (`icon.icns`, `icon.ico`, optional Linux `.png`)
- **Native module errors**: Ensure `node-pty` is in externals in both `electron.vite.config.ts` and `electron-builder.ts`
