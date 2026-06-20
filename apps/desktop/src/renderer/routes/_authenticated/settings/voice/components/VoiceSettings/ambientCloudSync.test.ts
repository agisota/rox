import { describe, expect, it } from "bun:test";
import {
	type AmbientCloudState,
	resolveAmbientContext,
	resolveAmbientEnabled,
	toCloudPersona,
} from "./ambientCloudSync";

const cloud = (
	ambientEnabled: boolean,
	voiceAgentContext: string | null,
): AmbientCloudState => ({ ambientEnabled, voiceAgentContext });

describe("resolveAmbientEnabled", () => {
	it("prefers the cloud row once loaded (source of truth for the nudge job)", () => {
		expect(resolveAmbientEnabled(cloud(true, null), false)).toBe(true);
		expect(resolveAmbientEnabled(cloud(false, null), true)).toBe(false);
	});

	it("falls back to the local flag while the cloud read is pending/failed", () => {
		expect(resolveAmbientEnabled(undefined, true)).toBe(true);
		expect(resolveAmbientEnabled(undefined, false)).toBe(false);
	});

	it("defaults to false (opt-in) when neither is known", () => {
		expect(resolveAmbientEnabled(undefined, undefined)).toBe(false);
	});
});

describe("resolveAmbientContext", () => {
	it("prefers the cloud persona, normalising NULL to empty", () => {
		expect(resolveAmbientContext(cloud(true, "from cloud"), "local")).toBe(
			"from cloud",
		);
		expect(resolveAmbientContext(cloud(true, null), "local")).toBe("");
	});

	it("falls back to the local value before the cloud read resolves", () => {
		expect(resolveAmbientContext(undefined, "local")).toBe("local");
		expect(resolveAmbientContext(undefined, undefined)).toBe("");
	});
});

describe("toCloudPersona", () => {
	it("trims and maps empty/whitespace to null (clears the persona)", () => {
		expect(toCloudPersona("  hi  ")).toBe("hi");
		expect(toCloudPersona("   ")).toBeNull();
		expect(toCloudPersona("")).toBeNull();
	});
});
