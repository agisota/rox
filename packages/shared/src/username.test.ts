import { describe, expect, it } from "bun:test";
import {
	HANDLE_MAX_LENGTH,
	HANDLE_MIN_LENGTH,
	isValidHandle,
	RESERVED_HANDLES,
	validateHandle,
} from "./username";

describe("validateHandle", () => {
	it("accepts a simple lowercase handle", () => {
		const result = validateHandle("mark");
		expect(result.ok).toBe(true);
		expect(result.normalized).toBe("mark");
		expect(result.error).toBeUndefined();
	});

	it("accepts digits and underscores", () => {
		expect(validateHandle("mark_99").ok).toBe(true);
		expect(validateHandle("a1_b2").ok).toBe(true);
	});

	it("trims and lowercases before validating", () => {
		const result = validateHandle("  MarkL  ");
		expect(result.ok).toBe(true);
		expect(result.normalized).toBe("markl");
	});

	it("rejects empty input", () => {
		const result = validateHandle("   ");
		expect(result.ok).toBe(false);
		expect(result.error).toBe("empty");
	});

	it("rejects handles shorter than the minimum", () => {
		const result = validateHandle("abc");
		expect(result.ok).toBe(false);
		expect(result.error).toBe("too_short");
		expect(result.normalized).toBe("abc");
	});

	it("accepts handles at the exact length boundaries", () => {
		expect(validateHandle("a".repeat(HANDLE_MIN_LENGTH)).ok).toBe(true);
		expect(validateHandle("a".repeat(HANDLE_MAX_LENGTH)).ok).toBe(true);
	});

	it("rejects handles longer than the maximum", () => {
		const result = validateHandle("a".repeat(HANDLE_MAX_LENGTH + 1));
		expect(result.ok).toBe(false);
		expect(result.error).toBe("too_long");
	});

	it("rejects disallowed characters", () => {
		expect(validateHandle("mark-l").error).toBe("invalid_chars");
		expect(validateHandle("mark.l").error).toBe("invalid_chars");
		expect(validateHandle("mark l").error).toBe("invalid_chars");
		expect(validateHandle("маркl").error).toBe("invalid_chars");
		expect(validateHandle("Mark$").error).toBe("invalid_chars");
	});

	it("rejects reserved section-path words", () => {
		for (const word of ["agents", "skills", "drive", "feed", "projects"]) {
			const result = validateHandle(word);
			expect(result.ok).toBe(false);
			expect(result.error).toBe("reserved");
		}
	});

	it("rejects reserved system words case-insensitively", () => {
		expect(validateHandle("Admin").error).toBe("reserved");
		expect(validateHandle("Settings").error).toBe("reserved");
		expect(validateHandle("DOCS").error).toBe("reserved");
	});

	it("checks length before reserved-word collisions", () => {
		// "api" is reserved but also too short — length wins.
		expect(validateHandle("api").error).toBe("too_short");
	});
});

describe("isValidHandle", () => {
	it("mirrors validateHandle.ok", () => {
		expect(isValidHandle("validname")).toBe(true);
		expect(isValidHandle("admin")).toBe(false);
		expect(isValidHandle("no")).toBe(false);
	});
});

describe("RESERVED_HANDLES", () => {
	it("contains every @<handle> section path", () => {
		for (const section of [
			"agents",
			"subagents",
			"hooks",
			"drive",
			"feed",
			"projects",
			"stats",
			"skills",
			"shared",
		]) {
			expect(RESERVED_HANDLES.has(section)).toBe(true);
		}
	});
});
