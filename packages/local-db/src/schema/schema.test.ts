import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "./schema";
import {
	browserHistory,
	projects,
	savedPrompts,
	settings,
	workspaceSections,
	workspaces,
	worktrees,
} from "./schema";

/**
 * Round-trip tests against a throwaway in-memory SQLite database.
 * The drizzle bun-sqlite driver does not create tables, so we apply a minimal
 * DDL that mirrors the schema columns under test. This never touches any real
 * user database file.
 */

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;

/** Returns the single returned row, failing the test if none was produced. */
function single<T>(rows: T[]): T {
	const row = rows[0];
	if (row === undefined) {
		throw new Error("expected exactly one returned row, got none");
	}
	return row;
}

const DDL = `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  main_repo_path TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  tab_order INTEGER,
  last_opened_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  config_toast_dismissed INTEGER,
  default_branch TEXT,
  workspace_base_branch TEXT,
  github_owner TEXT,
  branch_prefix_mode TEXT,
  branch_prefix_custom TEXT,
  worktree_base_dir TEXT,
  hide_image INTEGER,
  icon_url TEXT,
  neon_project_id TEXT,
  default_app TEXT
);
CREATE TABLE worktrees (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_branch TEXT,
  created_at INTEGER NOT NULL,
  git_status TEXT,
  github_status TEXT,
  created_by_rox INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE workspace_sections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tab_order INTEGER NOT NULL,
  is_collapsed INTEGER DEFAULT 0,
  color TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  worktree_id TEXT REFERENCES worktrees(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  branch TEXT NOT NULL,
  name TEXT NOT NULL,
  tab_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_opened_at INTEGER NOT NULL,
  is_unread INTEGER DEFAULT 0,
  is_unnamed INTEGER DEFAULT 0,
  deleting_at INTEGER,
  port_base INTEGER,
  section_id TEXT REFERENCES workspace_sections(id) ON DELETE SET NULL
);
CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_active_workspace_id TEXT,
  terminal_presets TEXT,
  terminal_presets_initialized INTEGER,
  agent_preset_overrides TEXT,
  agent_custom_definitions TEXT,
  agent_preset_permissions_migrated_at INTEGER,
  selected_ringtone_id TEXT,
  active_organization_id TEXT,
  confirm_on_quit INTEGER,
  terminal_link_behavior TEXT,
  persist_terminal INTEGER DEFAULT 1,
  auto_apply_default_preset INTEGER,
  branch_prefix_mode TEXT DEFAULT 'custom',
  branch_prefix_custom TEXT DEFAULT 'rox',
  notification_sounds_muted INTEGER,
  notification_volume INTEGER,
  delete_local_branch INTEGER,
  file_open_mode TEXT,
  show_presets_bar INTEGER,
  use_compact_terminal_add_button INTEGER,
  terminal_font_family TEXT DEFAULT 'Geist Mono',
  terminal_font_size INTEGER DEFAULT 12,
  editor_font_family TEXT DEFAULT 'SF UI Display Pro',
  editor_font_size INTEGER DEFAULT 12,
  show_resource_monitor INTEGER DEFAULT 1,
  worktree_base_dir TEXT,
  open_links_in_app INTEGER,
  default_editor TEXT,
  expose_host_service_via_relay INTEGER
);
CREATE TABLE browser_history (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  favicon_url TEXT,
  last_visited_at INTEGER NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE saved_prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

beforeEach(() => {
	sqlite = new Database(":memory:");
	sqlite.run("PRAGMA foreign_keys = ON;");
	sqlite.run(DDL);
	db = drizzle(sqlite, { schema });
});

afterEach(() => {
	sqlite.close();
});

describe("projects round-trip", () => {
	test("inserts with generated id/timestamps and reads the row back", () => {
		const row = single(
			db
				.insert(projects)
				.values({ mainRepoPath: "/repo", name: "Demo", color: "#fff" })
				.returning()
				.all(),
		);

		expect(row.id).toBeTypeOf("string");
		expect(row.id.length).toBeGreaterThan(0);
		expect(row.name).toBe("Demo");
		expect(row.mainRepoPath).toBe("/repo");
		expect(row.createdAt).toBeTypeOf("number");
		expect(row.lastOpenedAt).toBeTypeOf("number");

		const found = db
			.select()
			.from(projects)
			.where(eq(projects.id, row.id))
			.get();
		expect(found?.name).toBe("Demo");
	});

	test("maps the config_toast_dismissed boolean column", () => {
		const row = single(
			db
				.insert(projects)
				.values({
					mainRepoPath: "/r",
					name: "B",
					color: "#000",
					configToastDismissed: true,
				})
				.returning()
				.all(),
		);
		expect(row.configToastDismissed).toBe(true);
	});
});

describe("worktrees round-trip", () => {
	test("persists json git status and defaults created_by_rox to true", () => {
		const project = single(
			db
				.insert(projects)
				.values({ mainRepoPath: "/r", name: "P", color: "#1" })
				.returning()
				.all(),
		);

		const wt = single(
			db
				.insert(worktrees)
				.values({
					projectId: project.id,
					path: "/r/wt",
					branch: "feature",
					gitStatus: {
						branch: "feature",
						needsRebase: false,
						lastRefreshed: 99,
					},
				})
				.returning()
				.all(),
		);

		expect(wt.createdByRox).toBe(true);
		expect(wt.gitStatus).toEqual({
			branch: "feature",
			needsRebase: false,
			lastRefreshed: 99,
		});

		const found = db
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, wt.id))
			.get();
		expect(found?.gitStatus?.branch).toBe("feature");
	});

	test("cascades delete from project to worktrees", () => {
		const project = single(
			db
				.insert(projects)
				.values({ mainRepoPath: "/r", name: "P", color: "#1" })
				.returning()
				.all(),
		);
		db.insert(worktrees)
			.values({ projectId: project.id, path: "/r/wt", branch: "b" })
			.run();

		db.delete(projects).where(eq(projects.id, project.id)).run();

		const remaining = db.select().from(worktrees).all();
		expect(remaining).toHaveLength(0);
	});
});

describe("workspaces round-trip", () => {
	test("inserts a worktree workspace linked to project and worktree", () => {
		const project = single(
			db
				.insert(projects)
				.values({ mainRepoPath: "/r", name: "P", color: "#1" })
				.returning()
				.all(),
		);
		const wt = single(
			db
				.insert(worktrees)
				.values({ projectId: project.id, path: "/r/wt", branch: "b" })
				.returning()
				.all(),
		);

		const ws = single(
			db
				.insert(workspaces)
				.values({
					projectId: project.id,
					worktreeId: wt.id,
					type: "worktree",
					branch: "b",
					name: "WS",
					tabOrder: 0,
				})
				.returning()
				.all(),
		);

		expect(ws.type).toBe("worktree");
		expect(ws.worktreeId).toBe(wt.id);
		expect(ws.isUnread).toBe(false);
		expect(ws.updatedAt).toBeTypeOf("number");
	});

	test("nulls the section link when a referenced section is removed", () => {
		const project = single(
			db
				.insert(projects)
				.values({ mainRepoPath: "/r", name: "P", color: "#1" })
				.returning()
				.all(),
		);
		const section = single(
			db
				.insert(workspaceSections)
				.values({ projectId: project.id, name: "Group", tabOrder: 0 })
				.returning()
				.all(),
		);
		const ws = single(
			db
				.insert(workspaces)
				.values({
					projectId: project.id,
					type: "branch",
					branch: "main",
					name: "WS",
					tabOrder: 0,
					sectionId: section.id,
				})
				.returning()
				.all(),
		);
		expect(ws.sectionId).toBe(section.id);

		db.delete(workspaceSections)
			.where(eq(workspaceSections.id, section.id))
			.run();

		const found = db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, ws.id))
			.get();
		expect(found?.sectionId).toBeNull();
	});
});

describe("settings round-trip", () => {
	test("applies column defaults and round-trips json terminal presets", () => {
		const row = single(
			db
				.insert(settings)
				.values({
					id: 1,
					terminalPresets: [
						{ id: "p", name: "Dev", cwd: "/r", commands: ["bun dev"] },
					],
				})
				.returning()
				.all(),
		);

		expect(row.branchPrefixMode).toBe("custom");
		expect(row.branchPrefixCustom).toBe("rox");
		expect(row.terminalFontFamily).toBe("Geist Mono");
		expect(row.editorFontFamily).toBe("SF UI Display Pro");
		expect(row.terminalPresets?.[0]?.commands).toEqual(["bun dev"]);
	});
});

describe("browser history + saved prompts round-trip", () => {
	test("browser history applies title/visit defaults", () => {
		const row = single(
			db
				.insert(browserHistory)
				.values({ url: "https://example.test" })
				.returning()
				.all(),
		);
		expect(row.title).toBe("");
		expect(row.visitCount).toBe(1);
		expect(row.lastVisitedAt).toBeTypeOf("number");
	});

	test("saved prompts persist title and body with generated id", () => {
		const row = single(
			db
				.insert(savedPrompts)
				.values({ title: "Snippet", body: "Hello" })
				.returning()
				.all(),
		);
		expect(row.id).toBeTypeOf("string");
		expect(row.title).toBe("Snippet");

		const all = db.select().from(savedPrompts).all();
		expect(all).toHaveLength(1);
	});
});
