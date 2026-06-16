import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	LEGACY_ROX_HOME_DIR_NAME,
	ROX_HOME_DIR_NAME,
} from "@rox/shared/rox-dirs";
import { migrateRoxDir } from "@rox/shared/rox-dirs-node";
import { eq, inArray } from "drizzle-orm";
import type { HostDb } from "../../db";
import { projects } from "../../db/schema";

/**
 * Demo project seeding.
 *
 * On first launch we drop a single, friendly demo project into the user's
 * `~/rox/projects` directory so the dashboard is never empty. The seed is
 * idempotent: it is keyed on the on-disk path, so re-running it (e.g. on every
 * boot) never produces duplicates.
 *
 * Note on visual metadata: project `color`/`iconUrl` live in the renderer's
 * `local-db` projects table, not the host-service db (which owns repo/worktree
 * data). The yellow color + bundled icon are exposed here as constants so the
 * renderer can apply them when it first surfaces the demo project.
 */

/** Folder name for the bundled demo project under `~/rox/projects`. */
export const DEMO_PROJECT_DIR_NAME = "001_demo_project";

/** Display color for the demo project (yellow), applied by the renderer. */
export const DEMO_PROJECT_COLOR = "#facc15";

/** Bundled icon, relative to the desktop app's `resources` dir. */
export const DEMO_PROJECT_ICON_PATH = "icons/demo-project.svg";

const DEMO_PROJECT_README = `# Demo Project

Welcome to Rox! This is a demo project created on first launch so you have
somewhere to explore. Feel free to delete it once you've added your own.
`;

/** Resolve the absolute path of the demo project for a given home dir. */
export function getDemoProjectPath(home: string = homedir()): string {
	return join(home, ROX_HOME_DIR_NAME, "projects", DEMO_PROJECT_DIR_NAME);
}

function getLegacyDemoProjectPath(home: string = homedir()): string {
	return join(
		home,
		LEGACY_ROX_HOME_DIR_NAME,
		"projects",
		DEMO_PROJECT_DIR_NAME,
	);
}

export interface SeedDemoProjectResult {
	/** True when a new demo project row was inserted this call. */
	seeded: boolean;
	/** The demo project's id (existing or newly created). */
	projectId: string;
	/** Absolute on-disk path of the demo project. */
	repoPath: string;
}

/**
 * Ensure the demo project exists. Idempotent — guarded by the project's
 * on-disk path, so calling it repeatedly is safe.
 */
export function seedDemoProject(
	db: HostDb,
	home: string = homedir(),
): SeedDemoProjectResult {
	const repoPath = getDemoProjectPath(home);
	const legacyRepoPath = getLegacyDemoProjectPath(home);
	migrateRoxDir(legacyRepoPath, repoPath);

	const existingRows = db
		.select({ id: projects.id, repoPath: projects.repoPath })
		.from(projects)
		.where(inArray(projects.repoPath, [repoPath, legacyRepoPath]))
		.all();
	const existing =
		existingRows.find((row) => row.repoPath === repoPath) ?? existingRows[0];

	if (existing) {
		if (existing.repoPath !== repoPath) {
			db.update(projects)
				.set({ repoPath })
				.where(eq(projects.id, existing.id))
				.run();
		}
		const duplicateIds = existingRows
			.filter((row) => row.id !== existing.id)
			.map((row) => row.id);
		if (duplicateIds.length > 0) {
			db.delete(projects).where(inArray(projects.id, duplicateIds)).run();
		}
		return { seeded: false, projectId: existing.id, repoPath };
	}

	// Materialize the folder so the project points at a real directory.
	mkdirSync(repoPath, { recursive: true });
	writeFileSync(join(repoPath, "README.md"), DEMO_PROJECT_README);

	const projectId = randomUUID();
	db.insert(projects)
		.values({ id: projectId, repoPath })
		.onConflictDoNothing({ target: projects.id })
		.run();

	return { seeded: true, projectId, repoPath };
}
