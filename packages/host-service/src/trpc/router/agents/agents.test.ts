import { describe, expect, test } from "bun:test";
import { checkAgentCommandAvailability } from "./agents";

describe("checkAgentCommandAvailability", () => {
	test("accepts an available command from PATH", async () => {
		const command = process.platform === "win32" ? "cmd" : "sh";

		const result = await checkAgentCommandAvailability(
			command,
			undefined,
			process.env as Record<string, string>,
		);

		expect(result.available).toBe(true);
		if (result.available) {
			expect(result.resolvedPath.length).toBeGreaterThan(0);
		}
	});

	test("returns a diagnostic for a missing command", async () => {
		const result = await checkAgentCommandAvailability(
			"rox-definitely-missing-agent-command-zzzz",
			undefined,
			process.env as Record<string, string>,
		);

		expect(result.available).toBe(false);
		if (!result.available) {
			expect(result.reason).toContain(
				"rox-definitely-missing-agent-command-zzzz",
			);
		}
	});
});
