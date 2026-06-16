import { describe, expect, it } from "bun:test";
import {
	buildPreinstallCatalog,
	type PreinstallCatalogItem,
	resolveAutoInstallPlan,
	shouldAutoInstall,
} from "./install-plan";

const catalog = buildPreinstallCatalog();

/** Agents the productization roadmap bundles into the preinstall catalog. */
const BUNDLED_AGENT_PRESET_IDS = [
	"omp",
	"codex",
	"claude",
	"droid",
	"gemini",
	"qwen",
	"kimi",
] as const;

function byId(presetId: string): PreinstallCatalogItem | undefined {
	return catalog.find((item) => item.presetId === presetId);
}

describe("buildPreinstallCatalog", () => {
	it("returns a non-empty catalog", () => {
		expect(catalog.length).toBeGreaterThan(0);
	});

	it("gives every item the required fields", () => {
		for (const item of catalog) {
			expect(typeof item.presetId).toBe("string");
			expect(item.presetId.length).toBeGreaterThan(0);
			expect(item.label.length).toBeGreaterThan(0);
			expect(item.kind === "agent" || item.kind === "harness").toBe(true);
			expect(Array.isArray(item.installCommands)).toBe(true);
			expect(Array.isArray(item.configFiles)).toBe(true);
			expect(typeof item.optional).toBe("boolean");
			expect(
				item.updateStrategy === "latest" || item.updateStrategy === "pinned",
			).toBe(true);
		}
	});

	it("keeps presetIds unique across agents and harnesses", () => {
		const ids = catalog.map((item) => item.presetId);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("gives every agent item a check command and at least one install command", () => {
		const agents = catalog.filter((item) => item.kind === "agent");
		expect(agents.length).toBeGreaterThan(0);
		for (const agent of agents) {
			expect(agent.checkCommand?.trim().length ?? 0).toBeGreaterThan(0);
			expect(agent.installCommands.length).toBeGreaterThan(0);
			for (const command of agent.installCommands) {
				expect(command.trim().length).toBeGreaterThan(0);
			}
		}
	});

	it("bundles every roadmap coding agent as a catalog item", () => {
		for (const presetId of BUNDLED_AGENT_PRESET_IDS) {
			const item = byId(presetId);
			expect(item).toBeDefined();
			expect(item?.kind).toBe("agent");
			expect(item?.checkCommand?.length ?? 0).toBeGreaterThan(0);
			expect(item?.installCommands.length).toBeGreaterThan(0);
		}
	});

	it("surfaces Open Dynamic Workflows as an optional OMP harness", () => {
		const item = byId("open-dynamic-workflows-omp");

		expect(item).toBeDefined();
		expect(item?.kind).toBe("harness");
		expect(item?.optional).toBe(true);
		expect(item?.installCommands).toEqual([
			"npm install -g open-dynamic-workflows@latest",
		]);
		expect(item?.configFiles).toEqual([
			{
				path: ".config/odw/config.json",
				overwrite: false,
				templateRef: "open-dynamic-workflows-omp",
			},
		]);
		expect(item?.audit).toMatchObject({
			terminalPresetStrategy: "base-agent",
		});
	});

	it("carries harness audit receipts into the installer catalog", () => {
		for (const presetId of [
			"oh-my-claudecode",
			"oh-my-codex",
			"oh-my-openagent",
			"hermes",
			"openclaw",
			"ouroboros",
		]) {
			const item = byId(presetId);
			expect(item).toBeDefined();
			expect(item?.kind).toBe("harness");
			expect(item?.audit?.license.length ?? 0).toBeGreaterThan(0);
			expect(item?.audit?.notes.length ?? 0).toBeGreaterThan(0);
			expect(item?.audit?.terminalPresetStrategy).toBe("base-agent");
		}
	});

	it("requires a pinnedVersion exactly when updateStrategy is pinned", () => {
		for (const item of catalog) {
			if (item.updateStrategy === "pinned") {
				expect(item.pinnedVersion?.length ?? 0).toBeGreaterThan(0);
				// A pinned install command should reference the pinned version.
				const pinned = item.pinnedVersion as string;
				expect(item.installCommands.some((c) => c.includes(pinned))).toBe(true);
			} else {
				expect(item.pinnedVersion).toBeUndefined();
			}
		}
	});

	it("marks items without install commands as optional", () => {
		for (const item of catalog) {
			if (item.installCommands.length === 0) {
				expect(item.optional).toBe(true);
			}
		}
	});

	it("auto-installs only non-optional items that still have install commands", () => {
		const plan = resolveAutoInstallPlan(catalog, new Map());
		expect(plan.length).toBeGreaterThan(0);
		for (const item of plan) {
			expect(item.optional).toBe(false);
			expect(item.installCommands.length).toBeGreaterThan(0);
		}
		// Bundled agents ship as install-on-request (optional), so auto-install
		// never pulls them in on first launch.
		expect(plan.some((item) => item.presetId === "claude")).toBe(false);
		expect(plan.some((item) => item.presetId === "codex")).toBe(false);
	});

	it("never auto-installs an optional item regardless of status", () => {
		const optional = catalog.find((item) => item.optional);
		expect(optional).toBeDefined();
		if (optional) {
			expect(shouldAutoInstall(optional, undefined)).toBe(false);
			expect(shouldAutoInstall(optional, "pending")).toBe(false);
			expect(shouldAutoInstall(optional, "failed")).toBe(false);
		}
	});
});
