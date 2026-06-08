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
