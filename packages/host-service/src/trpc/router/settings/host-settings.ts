import type { BranchPrefixMode } from "@rox/shared/workspace-launch";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../db";
import { hostSettings } from "../../../db/schema";
import { normalizeWorktreeBaseDir } from "../workspace-creation/shared/worktree-paths";

export const HOST_SETTINGS_ID = 1;

// Set by the desktop coordinator from the v1 user setting so a first-run
// host-service inherits the previous worktree location instead of silently
// falling back to the default.
const LEGACY_WORKTREE_BASE_DIR_ENV = "ROX_LEGACY_WORKTREE_BASE_DIR";

// First-run defaults. New installs adopt the `rox` branch prefix; upgraders
// (any row that already exists) are never mutated here, so their explicit
// choices — including an explicit "none" — survive untouched.
export const DEFAULT_BRANCH_PREFIX_MODE: BranchPrefixMode = "custom";
export const DEFAULT_BRANCH_PREFIX_CUSTOM = "rox";

export type HostSettingsRow = typeof hostSettings.$inferSelect;

function resolveLegacyWorktreeBaseDir(): string | null {
	// v1 didn't validate paths, so a malformed legacy value shouldn't brick
	// first-run — treat anything that won't normalize as "no legacy".
	try {
		return normalizeWorktreeBaseDir(process.env[LEGACY_WORKTREE_BASE_DIR_ENV]);
	} catch {
		return null;
	}
}

// Local-first create defaults OFF. This is the SAFE default for a
// HIGH-blast-radius core-path change: a fresh `host_settings` row keeps
// production on today's proven synchronous-cloud-with-rollback create until the
// maintainer flips it (via `settings.localFirstCreate.set` or by seeding the
// row). A null column also reads as OFF (see `getHostLocalFirstCreate`).
export const DEFAULT_LOCAL_FIRST_CREATE = false;

// Auto-init git defaults ON: the empty/template/import-in-place create
// primitives already `git init` unconditionally, so a null column reads as true
// (today's behavior). Only an explicit `false` opts out.
export const DEFAULT_AUTO_INIT_GIT = true;

/**
 * Read the single-row `host_settings` (`id = 1`), creating it with first-run
 * defaults when absent. Centralizes the "first insert" so every entry point
 * (branch-prefix, worktree-location, branch creation) agrees on the seeded
 * defaults and never races to create competing rows.
 */
export function ensureHostSettingsRow(db: HostDb): HostSettingsRow {
	const existing = db
		.select()
		.from(hostSettings)
		.where(eq(hostSettings.id, HOST_SETTINGS_ID))
		.get();
	if (existing) return existing;

	db.insert(hostSettings)
		.values({
			id: HOST_SETTINGS_ID,
			worktreeBaseDir: resolveLegacyWorktreeBaseDir(),
			branchPrefixMode: DEFAULT_BRANCH_PREFIX_MODE,
			branchPrefixCustom: DEFAULT_BRANCH_PREFIX_CUSTOM,
		})
		.onConflictDoNothing()
		.run();

	const row = db
		.select()
		.from(hostSettings)
		.where(eq(hostSettings.id, HOST_SETTINGS_ID))
		.get();
	if (!row) {
		throw new Error("Failed to read back seeded host_settings row");
	}
	return row;
}

/**
 * Whether the instant local-first create path is enabled. Reads the host
 * setting (seeding the row on first read); a null column → OFF
 * (`DEFAULT_LOCAL_FIRST_CREATE`). Host-service reads this synchronously on the
 * create call — no renderer round-trip — which is exactly why the flag lives in
 * `host_settings` and not in the user-facing `experimental-features` registry.
 */
export function getHostLocalFirstCreate(db: HostDb): boolean {
	return (
		ensureHostSettingsRow(db).localFirstCreate ?? DEFAULT_LOCAL_FIRST_CREATE
	);
}

/**
 * Whether create auto-runs `git init` for a not-yet-a-repo folder. Null → true
 * (`DEFAULT_AUTO_INIT_GIT`, today's behavior).
 */
export function getHostAutoInitGit(db: HostDb): boolean {
	return ensureHostSettingsRow(db).autoInitGit ?? DEFAULT_AUTO_INIT_GIT;
}

/**
 * Root dir new projects are created under, or null to fall back to the default
 * `~/rox` at the call site (mirrors `getHostWorktreeBaseDir`).
 */
export function getHostProjectsBaseDir(db: HostDb): string | null {
	return ensureHostSettingsRow(db).projectsBaseDir ?? null;
}
