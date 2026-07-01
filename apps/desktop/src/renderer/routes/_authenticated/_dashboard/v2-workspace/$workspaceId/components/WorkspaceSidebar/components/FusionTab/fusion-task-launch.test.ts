import { describe, expect, it } from "bun:test";
import { buildFusionTaskLaunch } from "./fusion-task-launch";

function decodeDataUrl(dataUrl: string): string {
	const [, base64 = ""] = dataUrl.split(";base64,");
	return Buffer.from(base64, "base64").toString("utf-8");
}

describe("buildFusionTaskLaunch", () => {
	it("builds a runnable chat launch with markdown task context", () => {
		const launch = buildFusionTaskLaunch({
			task: {
				sourceTaskId: "FN-42",
				title: "Repair management panel",
				description: "Make the task actionable from Rox.",
				status: "todo",
				branch: "feat/management",
				labels: ["fusion", "priority:high"],
			},
			steps: [
				{
					blockName: "Wire UI",
					status: "pending",
					output: { description: "Add launch button." },
				},
			],
		});

		expect(launch.taskSlug).toBe("FN-42");
		expect(launch.initialPrompt).toContain("Запусти задачу Fusion FN-42");
		expect(launch.initialFiles?.[0]?.filename).toBe("fusion-task-FN-42.md");
		const markdown = decodeDataUrl(launch.initialFiles?.[0]?.data ?? "");
		expect(markdown).toContain("- ID: FN-42");
		expect(markdown).toContain("- Branch: feat/management");
		expect(markdown).toContain("Wire UI — pending");
	});
});
