import { describe, expect, test } from "bun:test";
import {
	buildLabelPrompt,
	LABEL_SUGGESTION_INSTRUCTIONS,
	MAX_SUGGESTED_LABELS,
	parseSuggestedLabels,
	reconcileSuggestions,
	TRANSCRIPT_PROMPT_MAX_CHARS,
	type TranscriptTurn,
} from "./label-suggestion";

describe("buildLabelPrompt", () => {
	test("joins non-empty turns role-prefixed", () => {
		const turns: TranscriptTurn[] = [
			{ role: "user", content: "Как настроить биллинг?" },
			{ role: "assistant", content: "Откройте раздел оплаты." },
		];
		expect(buildLabelPrompt(turns)).toBe(
			"user: Как настроить биллинг?\nassistant: Откройте раздел оплаты.",
		);
	});

	test("skips blank turns and returns empty for no usable text", () => {
		expect(buildLabelPrompt([{ role: "user", content: "   " }])).toBe("");
	});

	test("keeps the tail when over the char cap (settled topic is at the end)", () => {
		const long = "a".repeat(TRANSCRIPT_PROMPT_MAX_CHARS);
		const prompt = buildLabelPrompt([
			{ role: "user", content: long },
			{ role: "assistant", content: "TAIL_MARKER" },
		]);
		expect(prompt.length).toBeLessThanOrEqual(TRANSCRIPT_PROMPT_MAX_CHARS);
		expect(prompt.endsWith("TAIL_MARKER")).toBe(true);
	});
});

describe("parseSuggestedLabels", () => {
	test("splits on commas, lowercases, caps at the budget", () => {
		expect(parseSuggestedLabels("Billing, Onboarding, Bug, Design")).toEqual([
			"billing",
			"onboarding",
			"bug",
		]);
		expect(MAX_SUGGESTED_LABELS).toBe(3);
	});

	test("splits on newlines and strips list bullets / numbering / quotes", () => {
		expect(parseSuggestedLabels('1. "billing"\n- onboarding\n* bug')).toEqual([
			"billing",
			"onboarding",
			"bug",
		]);
	});

	test("drops case-insensitive duplicates, order-preserving", () => {
		expect(parseSuggestedLabels("Bug, bug, BUG, design")).toEqual([
			"bug",
			"design",
		]);
	});

	test("returns empty for an empty / whitespace completion", () => {
		expect(parseSuggestedLabels("   ")).toEqual([]);
	});
});

describe("reconcileSuggestions (manual override)", () => {
	test("drops suggestions already applied to the session (case-insensitive)", () => {
		expect(reconcileSuggestions(["billing", "bug"], ["Billing"])).toEqual([
			"bug",
		]);
	});

	test("returns all when nothing is applied", () => {
		expect(reconcileSuggestions(["billing", "bug"], [])).toEqual([
			"billing",
			"bug",
		]);
	});

	test("returns empty when every suggestion is already applied", () => {
		expect(reconcileSuggestions(["billing"], ["billing"])).toEqual([]);
	});
});

describe("LABEL_SUGGESTION_INSTRUCTIONS", () => {
	test("forbids identity (tags ⟂ identity) and caps the count", () => {
		expect(LABEL_SUGGESTION_INSTRUCTIONS).toContain("1 to 3");
		expect(LABEL_SUGGESTION_INSTRUCTIONS.toLowerCase()).toContain(
			"never use a person's name",
		);
	});
});
