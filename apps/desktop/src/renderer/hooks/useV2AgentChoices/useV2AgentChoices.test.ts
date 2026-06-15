import { describe, expect, it } from "bun:test";
import { getPreferredV2AgentId } from "./useV2AgentChoices";

describe("getPreferredV2AgentId", () => {
	it("prefers the OMP host config even when reconciliation appended it later", () => {
		expect(
			getPreferredV2AgentId([
				{ id: "claude-config", label: "Claude", iconId: "claude" },
				{ id: "omp-config", label: "Rox", iconId: "omp" },
				{ id: "rox", label: "Rox", iconId: "rox" },
			]),
		).toBe("omp-config");
	});

	it("falls back to the first available agent when OMP is missing", () => {
		expect(
			getPreferredV2AgentId([
				{ id: "claude-config", label: "Claude", iconId: "claude" },
				{ id: "rox", label: "Rox", iconId: "rox" },
			]),
		).toBe("claude-config");
	});

	it("returns null for an empty list", () => {
		expect(getPreferredV2AgentId([])).toBeNull();
	});
});
