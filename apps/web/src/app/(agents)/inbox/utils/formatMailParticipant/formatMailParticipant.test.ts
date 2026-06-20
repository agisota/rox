import { describe, expect, it } from "bun:test";

import {
	formatMailParticipant,
	mailParticipantInitial,
} from "./formatMailParticipant";

describe("formatMailParticipant", () => {
	it("prefers the display name when present", () => {
		expect(
			formatMailParticipant({ fromAddr: "a@b.com", fromName: "Alice" }),
		).toBe("Alice");
	});

	it("falls back to the address when no name", () => {
		expect(formatMailParticipant({ fromAddr: "a@b.com", fromName: null })).toBe(
			"a@b.com",
		);
	});

	it("trims whitespace-only names before falling back", () => {
		expect(
			formatMailParticipant({ fromAddr: "a@b.com", fromName: "   " }),
		).toBe("a@b.com");
	});

	it("uses a neutral placeholder when nothing is available", () => {
		expect(formatMailParticipant({ fromAddr: null })).toBe(
			"Неизвестный отправитель",
		);
	});
});

describe("mailParticipantInitial", () => {
	it("uppercases the first letter", () => {
		expect(mailParticipantInitial("alice")).toBe("A");
	});

	it("supports cyrillic", () => {
		expect(mailParticipantInitial("борис")).toBe("Б");
	});

	it("falls back to a bullet for non-alphanumeric leads", () => {
		expect(mailParticipantInitial("  @weird")).toBe("•");
	});
});
