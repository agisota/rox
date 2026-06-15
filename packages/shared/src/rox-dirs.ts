/**
 * Canonical directory names for Rox's app-runtime directories.
 *
 * This module is browser-safe: it contains only string constants and no
 * `node:*` imports, so it can be pulled into the renderer bundle. The
 * filesystem helpers (resolve/migrate) that need `node:fs`/`node:path` live in
 * `./rox-dirs-node` and must only be imported from main/node code.
 *
 * The per-workspace config dir and the per-user home dir were historically
 * dot-hidden (`.rox`). They are now visible top-level folders (`rox`) so users
 * can find them. Existing installs keep working via the LEGACY_* fallbacks and
 * the one-time idempotent migration in `./rox-dirs-node`.
 *
 * NOTE: This does NOT cover the repo's own dev/CI tooling dir (`.rox/`,
 * `.rox/setup.local.sh`, etc.) — that is separate infra and intentionally
 * stays dot-hidden.
 */

/** Visible per-workspace config dir name (`<repo>/rox`). */
export const PROJECT_ROX_DIR_NAME = "rox";
/** Legacy dot-hidden per-workspace config dir name (`<repo>/.rox`). */
export const LEGACY_PROJECT_ROX_DIR_NAME = ".rox";

/** Visible per-user home dir name (`~/rox`). */
export const ROX_HOME_DIR_NAME = "rox";
/** Legacy dot-hidden per-user home dir name (`~/.rox`). */
export const LEGACY_ROX_HOME_DIR_NAME = ".rox";
