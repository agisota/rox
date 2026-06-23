import { describe, expect, it } from "bun:test";
import { canStartDictation } from "./canStartDictation";

describe("canStartDictation", () => {
	it("allows dictation when enabled and not transcribing", () => {
		expect(canStartDictation(false, false)).toBe(true);
	});
	it("blocks dictation when disabled (e.g. voice not configured)", () => {
		expect(canStartDictation(true, false)).toBe(false);
	});
	it("blocks dictation while a previous clip is transcribing", () => {
		expect(canStartDictation(false, true)).toBe(false);
	});
	it("blocks when both disabled and transcribing", () => {
		expect(canStartDictation(true, true)).toBe(false);
	});
	it("treats undefined props as not-disabled / not-transcribing", () => {
		expect(canStartDictation(undefined, undefined)).toBe(true);
	});
});
