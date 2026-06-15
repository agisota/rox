import { describe, expect, it } from "bun:test";
import type { PreinstallStatusEntry } from "@rox/host-service/settings";
import {
	getOmpOdwHarnessEntry,
	getOmpOdwHarnessState,
	isOmpAgent,
} from "./useAgentPreinstallStatus";

function createEntry(
	status: PreinstallStatusEntry["status"],
	presetId = "open-dynamic-workflows-omp",
): PreinstallStatusEntry {
	return {
		presetId,
		kind: "harness",
		label: "Open Dynamic Workflows + Oh My Pi",
		optional: true,
		status,
		version: null,
		lastError: null,
		installedAt: null,
	};
}

describe("OMP ODW harness UI helpers", () => {
	it("finds the ODW harness catalog entry", () => {
		expect(
			getOmpOdwHarnessEntry([
				createEntry("installed", "claude"),
				createEntry("installed"),
			])?.presetId,
		).toBe("open-dynamic-workflows-omp");
	});

	it("maps preinstall statuses to compact UI states", () => {
		expect(getOmpOdwHarnessState(null)).toBe("unavailable");
		expect(getOmpOdwHarnessState(createEntry("pending"))).toBe("off");
		expect(getOmpOdwHarnessState(createEntry("skipped"))).toBe("off");
		expect(getOmpOdwHarnessState(createEntry("installing"))).toBe("installing");
		expect(getOmpOdwHarnessState(createEntry("installed"))).toBe("ready");
		expect(getOmpOdwHarnessState(createEntry("failed"))).toBe("failed");
	});

	it("recognizes OMP host configs even when their id is host-scoped", () => {
		expect(
			isOmpAgent({ id: "host-uuid", label: "Oh My Pi", iconId: "omp" }),
		).toBe(true);
		expect(isOmpAgent({ id: "claude", label: "Claude" })).toBe(false);
	});
});
