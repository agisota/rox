import { afterEach, describe, expect, test } from "bun:test";
import {
	clearEmbedTextResolversForTest,
	defaultEmbedText,
	embedTextForEntity,
	registerEmbedTextResolver,
} from "./embed-text";
import { objectKey } from "./object-store";

afterEach(() => {
	clearEmbedTextResolversForTest();
});

describe("runtime embed text", () => {
	test("normalizes default title, markdown, and summary text", () => {
		expect(
			embedTextForEntity({
				kind: "note",
				title: "Launch",
				markdown: "Plan\n\nnext",
				body: { summary: "Ship it" },
			}),
		).toBe("Launch Plan next Ship it");
	});

	test("uses registered resolver for a kind", () => {
		registerEmbedTextResolver("agent_session", (entity) =>
			[entity.title, entity.body?.summary].filter(Boolean).join(": "),
		);

		expect(
			embedTextForEntity({
				kind: "agent_session",
				title: "Run",
				body: { summary: "Fixed graph" },
			}),
		).toBe("Run: Fixed graph");
	});

	test("defaultEmbedText keeps source sections before normalization", () => {
		expect(
			defaultEmbedText({
				kind: "note",
				title: "T",
				markdown: "M",
				body: { summary: "S" },
			}),
		).toBe("T\n\nM\n\nS");
	});
});

describe("object keys", () => {
	test("builds stable nested object keys", () => {
		expect(objectKey("/files/", "abc", "/deck.pdf")).toBe("files/abc/deck.pdf");
		expect(objectKey("frames", "abc")).toBe("frames/abc");
	});
});
