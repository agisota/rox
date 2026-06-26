import { describe, expect, it } from "bun:test";
import type { BlameAuthor } from "../../hooks/useFileTreeBlame";
import { formatBlameDecoration } from "./formatBlameDecoration";

function blame(overrides: Partial<BlameAuthor> = {}): BlameAuthor {
	return {
		name: "Ada Lovelace",
		email: "ada@example.com",
		commit: "0123456789abcdef0123456789abcdef01234567",
		timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
		...overrides,
	};
}

describe("formatBlameDecoration", () => {
	it("shows uppercase initials and relative age in the lane text", () => {
		const { text } = formatBlameDecoration(blame());
		expect(text).toBe("AL · 3d");
	});

	it("puts full name, email, age and short commit in the title", () => {
		const { title } = formatBlameDecoration(blame());
		expect(title).toContain("Ada Lovelace");
		expect(title).toContain("<ada@example.com>");
		expect(title).toContain("3d");
		expect(title).toContain("0123456"); // 7-char short commit
		expect(title).not.toContain("0123456789"); // not the full sha
	});

	it("falls back to email when name is empty", () => {
		const { title } = formatBlameDecoration(blame({ name: "" }));
		expect(title.startsWith("ada@example.com")).toBe(true);
	});

	it("omits the email suffix when email is empty", () => {
		const { text, title } = formatBlameDecoration(
			blame({ name: "Mononym", email: "" }),
		);
		// Single word → first two letters.
		expect(text.startsWith("MO ·")).toBe(true);
		expect(title).not.toContain("<>");
	});

	it("renders Unknown when name and email are both empty", () => {
		const { title } = formatBlameDecoration(blame({ name: "", email: "" }));
		expect(title.startsWith("Unknown")).toBe(true);
	});
});
