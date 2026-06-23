import { describe, expect, test } from "bun:test";
import {
	NOTES_HEADLINE_START,
	NOTES_HEADLINE_STOP,
	splitHighlightedSnippet,
} from "./notes-search";

const hl = (s: string) => `${NOTES_HEADLINE_START}${s}${NOTES_HEADLINE_STOP}`;

describe("splitHighlightedSnippet", () => {
	test("returns [] for empty input", () => {
		expect(splitHighlightedSnippet("")).toEqual([]);
	});

	test("plain text with no markers is a single non-highlighted segment", () => {
		expect(splitHighlightedSnippet("just text")).toEqual([
			{ text: "just text", highlight: false },
		]);
	});

	test("splits leading/trailing text around a highlighted run", () => {
		expect(splitHighlightedSnippet(`before ${hl("match")} after`)).toEqual([
			{ text: "before ", highlight: false },
			{ text: "match", highlight: true },
			{ text: " after", highlight: false },
		]);
	});

	test("handles multiple highlighted runs", () => {
		expect(splitHighlightedSnippet(`${hl("a")} mid ${hl("b")}`)).toEqual([
			{ text: "a", highlight: true },
			{ text: " mid ", highlight: false },
			{ text: "b", highlight: true },
		]);
	});

	test("is total on an unbalanced start marker (no throw)", () => {
		const out = splitHighlightedSnippet(`x ${NOTES_HEADLINE_START}y`);
		expect(out).toEqual([
			{ text: "x ", highlight: false },
			{ text: "y", highlight: false },
		]);
	});

	test("preserves surrounding markdown characters verbatim", () => {
		// The snippet is raw markdown; the splitter must preserve it so the UI can
		// render it as ESCAPED React text (it never injects HTML).
		const out = splitHighlightedSnippet(`# <b>${hl("hi")}</b> & co`);
		expect(out.map((s) => s.text).join("")).toBe("# <b>hi</b> & co");
		expect(out.find((s) => s.highlight)?.text).toBe("hi");
	});

	test("handles Russian content", () => {
		expect(splitHighlightedSnippet(`Новая ${hl("заметка")} здесь`)).toEqual([
			{ text: "Новая ", highlight: false },
			{ text: "заметка", highlight: true },
			{ text: " здесь", highlight: false },
		]);
	});
});
