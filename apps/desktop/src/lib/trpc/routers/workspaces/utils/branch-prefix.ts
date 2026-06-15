import type { projects } from "@rox/local-db";
import { settings } from "@rox/local-db";
import {
	DEFAULT_SETTINGS_BRANCH_PREFIX_CUSTOM,
	DEFAULT_SETTINGS_BRANCH_PREFIX_MODE,
} from "@rox/local-db/schema";
import { localDb } from "main/lib/local-db";
import { getBranchPrefix, sanitizeAuthorPrefix } from "./git";

type Project = typeof projects.$inferSelect;

/**
 * Resolves the branch prefix for a project, considering:
 * - Project-level overrides (if configured)
 * - Global settings (as fallback)
 * - Collision avoidance (if prefix matches existing branch)
 *
 * @param project - The project configuration
 * @param existingBranches - List of existing branch names to check for collisions
 * @returns The resolved prefix (e.g., "avi") or undefined if no prefix or collision
 */
export async function resolveBranchPrefix(
	project: Project,
	existingBranches: string[],
): Promise<string | undefined> {
	const globalSettings = localDb.select().from(settings).get();
	const projectOverrides = project.branchPrefixMode != null;
	const prefixMode = projectOverrides
		? project.branchPrefixMode
		: (globalSettings?.branchPrefixMode ?? DEFAULT_SETTINGS_BRANCH_PREFIX_MODE);
	const customPrefix = projectOverrides
		? project.branchPrefixCustom
		: (globalSettings?.branchPrefixCustom ??
			DEFAULT_SETTINGS_BRANCH_PREFIX_CUSTOM);

	const rawPrefix = await getBranchPrefix({
		repoPath: project.mainRepoPath,
		mode: prefixMode,
		customPrefix,
	});
	// Normalize empty strings to undefined (sanitizeAuthorPrefix can return "")
	const sanitizedPrefix = rawPrefix
		? sanitizeAuthorPrefix(rawPrefix) || undefined
		: undefined;

	// Check if prefix would collide with an existing branch name
	const existingSet = new Set(existingBranches.map((b) => b.toLowerCase()));
	const prefixWouldCollide =
		sanitizedPrefix && existingSet.has(sanitizedPrefix.toLowerCase());

	return prefixWouldCollide ? undefined : sanitizedPrefix;
}
