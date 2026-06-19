import { describe, expect, it, mock } from "bun:test";
import {
	assertKnownAutomationTarget,
	requestAllAutomationTargets,
	requestAutomationForTarget,
} from "./automation-permission";
import { AUTOMATION_TARGETS } from "./automation-targets";

type ExecCb = (
	error: (Error & { code?: number | string }) | null,
	stdout: string,
	stderr: string,
) => void;

function execFileSuccess() {
	return mock((_file: string, _args: string[], _opts: unknown, cb: ExecCb) => {
		cb(null, "name", "");
	});
}

function execFileFailure(message: string) {
	return mock((_file: string, _args: string[], _opts: unknown, cb: ExecCb) => {
		cb(new Error(message), "", message);
	});
}

describe("requestAutomationForTarget", () => {
	it("no-ops on non-darwin without spawning osascript", async () => {
		const execFileImpl = execFileSuccess();
		const result = await requestAutomationForTarget("com.apple.finder", {
			platform: "win32",
			execFileImpl,
		});
		expect(result).toEqual({
			bundleId: "com.apple.finder",
			granted: false,
			error: "not-darwin",
		});
		expect(execFileImpl).not.toHaveBeenCalled();
	});

	it("sends a benign Apple Event to the target on darwin and reports granted", async () => {
		const execFileImpl = execFileSuccess();
		const result = await requestAutomationForTarget("com.apple.finder", {
			platform: "darwin",
			execFileImpl,
		});
		expect(result).toEqual({ bundleId: "com.apple.finder", granted: true });
		expect(execFileImpl).toHaveBeenCalledTimes(1);
		const call = execFileImpl.mock.calls[0];
		expect(call?.[0]).toBe("osascript");
		expect(call?.[1]?.[0]).toBe("-e");
		expect(String(call?.[1]?.[1])).toContain("com.apple.finder");
	});

	it("reports not granted with the error message on failure", async () => {
		const execFileImpl = execFileFailure("Not authorized to send Apple events");
		const result = await requestAutomationForTarget("com.google.Chrome", {
			platform: "darwin",
			execFileImpl,
		});
		expect(result.granted).toBe(false);
		expect(result.bundleId).toBe("com.google.Chrome");
		expect(result.error).toContain("Not authorized");
	});
});

describe("requestAllAutomationTargets", () => {
	it("requests every registered target", async () => {
		const execFileImpl = execFileSuccess();
		const results = await requestAllAutomationTargets({
			platform: "darwin",
			execFileImpl,
		});
		expect(results).toHaveLength(AUTOMATION_TARGETS.length);
		expect(execFileImpl).toHaveBeenCalledTimes(AUTOMATION_TARGETS.length);
		expect(results.every((r) => r.granted)).toBe(true);
	});
});

describe("assertKnownAutomationTarget", () => {
	it("accepts a known target", () => {
		expect(() =>
			assertKnownAutomationTarget("com.apple.systemevents"),
		).not.toThrow();
	});

	it("rejects an unknown target", () => {
		expect(() => assertKnownAutomationTarget("com.evil.app")).toThrow();
	});
});
