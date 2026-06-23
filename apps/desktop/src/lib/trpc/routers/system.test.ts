import { describe, expect, test } from "bun:test";
import { gitToolsInstallPlan, installGitTools } from "./system";

describe("gitToolsInstallPlan", () => {
	test("darwin installs git + gh via brew in one step", () => {
		const plan = gitToolsInstallPlan("darwin");
		expect(plan).toEqual([
			{ tool: "git", command: "brew", args: ["install", "git", "gh"] },
		]);
	});

	test("win32 installs git and gh via winget", () => {
		const plan = gitToolsInstallPlan("win32");
		expect(plan.map((step) => step.tool)).toEqual(["git", "gh"]);
		expect(plan.every((step) => step.command === "winget")).toBe(true);
	});

	test("linux splits git (apt) from gh (manual)", () => {
		const plan = gitToolsInstallPlan("linux");

		const gitStep = plan.find((step) => step.tool === "git");
		expect(gitStep?.command).toBe("sudo");
		// git is its own apt step and does NOT include gh, so a gh problem can't
		// abort the git transaction.
		expect(gitStep?.args).toEqual(["apt-get", "install", "-y", "git"]);
		expect(gitStep?.args).not.toContain("gh");
		expect(gitStep?.requiresSudo).toBe(true);

		const ghStep = plan.find((step) => step.tool === "gh");
		// gh is routed to manual install (not in default apt repos).
		expect(ghStep?.manualOnly).toBe(true);
		expect(ghStep?.manualInstallUrl).toBeTruthy();
	});
});

const okDeps = () => ({
	platform: "linux" as NodeJS.Platform,
	hasPackageManager: async () => true,
	probePasswordlessSudo: async () => true,
	runStep: async () => {},
});

describe("installGitTools (linux)", () => {
	test("installs git via apt and routes gh to manual", async () => {
		const ran: string[] = [];
		const result = await installGitTools({
			...okDeps(),
			runStep: async (command, args) => {
				ran.push(`${command} ${args.join(" ")}`);
			},
		});

		expect(result.ok).toBe(true);
		// git ran via apt; gh was never executed.
		expect(ran).toEqual(["sudo apt-get install -y git"]);

		const gitStep = result.steps.find((step) => step.tool === "git");
		expect(gitStep?.status).toBe("ok");

		const ghStep = result.steps.find((step) => step.tool === "gh");
		expect(ghStep?.status).toBe("manual");
		expect(ghStep?.manualInstallUrl).toBeTruthy();
	});

	test("routes to manual when passwordless sudo is unavailable", async () => {
		const ran: string[] = [];
		const result = await installGitTools({
			...okDeps(),
			probePasswordlessSudo: async () => false,
			runStep: async (command, args) => {
				ran.push(`${command} ${args.join(" ")}`);
			},
		});

		expect(result.ok).toBe(false);
		expect(result.sudoUnavailable).toBe(true);
		expect(result.manualInstallUrl).toBeTruthy();
		// No sudo command was attempted.
		expect(ran).toEqual([]);

		const gitStep = result.steps.find((step) => step.tool === "git");
		expect(gitStep?.status).toBe("skipped");

		const ghStep = result.steps.find((step) => step.tool === "gh");
		expect(ghStep?.status).toBe("manual");
	});

	test("flags packageManagerMissing when apt is absent", async () => {
		const result = await installGitTools({
			...okDeps(),
			hasPackageManager: async () => false,
		});

		expect(result.ok).toBe(false);
		expect(result.packageManagerMissing).toBe(true);
		expect(result.steps.every((step) => step.status === "skipped")).toBe(true);
	});

	test("records a failed apt step", async () => {
		const result = await installGitTools({
			...okDeps(),
			runStep: async () => {
				throw new Error("apt boom");
			},
		});

		expect(result.ok).toBe(false);
		const gitStep = result.steps.find((step) => step.tool === "git");
		expect(gitStep?.status).toBe("failed");
		expect(gitStep?.error).toContain("apt boom");
		// gh is still surfaced as a manual link, not a failure.
		const ghStep = result.steps.find((step) => step.tool === "gh");
		expect(ghStep?.status).toBe("manual");
	});
});

describe("installGitTools (darwin)", () => {
	test("does not require a sudo probe and runs brew", async () => {
		const ran: string[] = [];
		let sudoProbed = false;
		const result = await installGitTools({
			platform: "darwin",
			hasPackageManager: async () => true,
			probePasswordlessSudo: async () => {
				sudoProbed = true;
				return true;
			},
			runStep: async (command, args) => {
				ran.push(`${command} ${args.join(" ")}`);
			},
		});

		expect(result.ok).toBe(true);
		expect(sudoProbed).toBe(false);
		expect(ran).toEqual(["brew install git gh"]);
	});
});
