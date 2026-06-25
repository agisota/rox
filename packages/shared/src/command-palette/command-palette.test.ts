import { describe, expect, it } from "bun:test";
import { executeCommand } from "./execute";
import { fuzzyScore, matchCommands, parseQuery } from "./matcher";
import { createCommandRegistry } from "./registry";
import { resolveActiveCommands } from "./resolve";
import type { Command, CommandProvider } from "./types";

interface TestCtx {
	workspace: boolean;
}

function cmd(
	partial: Partial<Command<TestCtx>> & { id: string },
): Command<TestCtx> {
	return { title: partial.id, section: "actions", ...partial };
}

describe("parseQuery", () => {
	it("detects scope prefixes and strips them", () => {
		expect(parseQuery(">open")).toEqual({ scope: ">", term: "open" });
		expect(parseQuery("# tag")).toEqual({ scope: "#", term: "tag" });
		expect(parseQuery("@me")).toEqual({ scope: "@", term: "me" });
		expect(parseQuery("/src/index")).toEqual({ scope: "/", term: "src/index" });
	});

	it("returns no scope for plain queries", () => {
		expect(parseQuery("settings")).toEqual({ scope: null, term: "settings" });
	});
});

describe("fuzzyScore", () => {
	it("matches subsequences and rejects non-matches", () => {
		expect(fuzzyScore("Open Settings", "ops")).toBeGreaterThan(0);
		expect(fuzzyScore("Open Settings", "xyz")).toBe(-1);
	});

	it("ranks prefix matches above scattered matches", () => {
		const prefix = fuzzyScore("settings", "set");
		const scattered = fuzzyScore("subset things", "set");
		expect(prefix).toBeGreaterThan(scattered);
	});
});

describe("matchCommands", () => {
	const commands: Command<TestCtx>[] = [
		cmd({ id: "open-settings", title: "Open Settings" }),
		cmd({ id: "tag-bug", title: "bug", scope: "#" }),
		cmd({ id: "profile-me", title: "me", scope: "@" }),
		cmd({ id: "file-readme", title: "README.md", scope: "/" }),
	];

	it("filters by scope prefix", () => {
		const tags = matchCommands(commands, "#bug").map((r) => r.command.id);
		expect(tags).toEqual(["tag-bug"]);
	});

	it("treats unscoped commands as the > command default", () => {
		const cmds = matchCommands(commands, ">set").map((r) => r.command.id);
		expect(cmds).toContain("open-settings");
		expect(cmds).not.toContain("tag-bug");
	});

	it("returns everything for an empty plain query", () => {
		expect(matchCommands(commands, "")).toHaveLength(commands.length);
	});
});

describe("createCommandRegistry + resolveActiveCommands", () => {
	const opts = {
		order: ["workspace", "actions"],
		labels: { workspace: "Workspace", actions: "Actions" },
	};

	it("registers, snapshots and unregisters providers", () => {
		const registry = createCommandRegistry<TestCtx>();
		let notified = 0;
		registry.subscribe(() => {
			notified += 1;
		});
		const provider: CommandProvider<TestCtx> = {
			id: "p1",
			provide: () => [cmd({ id: "a" })],
		};
		const off = registry.registerProvider(provider);
		expect(registry.getProviders()).toHaveLength(1);
		expect(notified).toBe(1);
		off();
		expect(registry.getProviders()).toHaveLength(0);
	});

	it("de-dupes by id, applies when-guards and orders sections", () => {
		const providers: CommandProvider<TestCtx>[] = [
			{
				id: "p1",
				provide: () => [
					cmd({ id: "dup", title: "First" }),
					cmd({
						id: "ws",
						section: "workspace",
						when: (c) => c.workspace,
					}),
				],
			},
			{ id: "p2", provide: () => [cmd({ id: "dup", title: "Second" })] },
		];

		const withWorkspace = resolveActiveCommands(
			providers,
			{ workspace: true },
			opts,
		);
		expect(withWorkspace.map((s) => s.id)).toEqual(["workspace", "actions"]);

		const noWorkspace = resolveActiveCommands(
			providers,
			{ workspace: false },
			opts,
		);
		expect(noWorkspace.map((s) => s.id)).toEqual(["actions"]);
		const actions = noWorkspace.find((s) => s.id === "actions");
		expect(actions?.commands).toHaveLength(1);
		expect(actions?.commands[0]?.title).toBe("First");
	});
});

describe("executeCommand", () => {
	it("runs the command and tracks it", async () => {
		const events: string[] = [];
		let ran = false;
		await executeCommand(
			cmd({
				id: "x",
				run: () => {
					ran = true;
				},
			}),
			{ workspace: false },
			{ track: (e) => events.push(e) },
		);
		expect(ran).toBe(true);
		expect(events).toEqual(["command_run"]);
	});

	it("short-circuits disabled commands and surfaces the reason", async () => {
		let ran = false;
		const infos: string[] = [];
		await executeCommand(
			cmd({
				id: "x",
				disabled: true,
				disabledReason: "nope",
				run: () => {
					ran = true;
				},
			}),
			{ workspace: false },
			{ notifyInfo: (m) => infos.push(m) },
		);
		expect(ran).toBe(false);
		expect(infos).toEqual(["nope"]);
	});

	it("reports thrown errors via notifyError", async () => {
		const errors: string[] = [];
		await executeCommand(
			cmd({
				id: "x",
				title: "Boom",
				run: () => {
					throw new Error("kaboom");
				},
			}),
			{ workspace: false },
			{ notifyError: (m) => errors.push(m) },
		);
		expect(errors[0]).toContain("kaboom");
	});
});
