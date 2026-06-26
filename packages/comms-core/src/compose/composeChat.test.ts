import { describe, expect, it } from "bun:test";
import {
	buildChatDraft,
	buildChatRecipients,
	type ComposeChatMember,
	canSendChatDraft,
	filterMembers,
	memberLabel,
	toggleRecipient,
} from "./composeChat";

describe("toggleRecipient", () => {
	it("adds an id when absent and returns a new set", () => {
		const initial = new Set<string>(["a"]);
		const next = toggleRecipient(initial, "b");
		expect(next).not.toBe(initial);
		expect([...next].sort()).toEqual(["a", "b"]);
		expect([...initial]).toEqual(["a"]);
	});

	it("removes an id when present", () => {
		const next = toggleRecipient(new Set(["a", "b"]), "a");
		expect([...next]).toEqual(["b"]);
	});
});

describe("buildChatRecipients", () => {
	it("maps ids to userId refs preserving first-seen order", () => {
		expect(buildChatRecipients(["u2", "u1"])).toEqual([
			{ kind: "userId", userId: "u2" },
			{ kind: "userId", userId: "u1" },
		]);
	});

	it("dedupes and drops empties", () => {
		expect(buildChatRecipients(["u1", "", "u1", "u2"])).toEqual([
			{ kind: "userId", userId: "u1" },
			{ kind: "userId", userId: "u2" },
		]);
	});
});

describe("canSendChatDraft / buildChatDraft", () => {
	it("requires at least one recipient and a non-empty body", () => {
		expect(canSendChatDraft([], "hi")).toBe(false);
		expect(canSendChatDraft(["u1"], "   ")).toBe(false);
		expect(canSendChatDraft(["u1"], "hi")).toBe(true);
	});

	it("returns null for incomplete drafts", () => {
		expect(buildChatDraft([], "hi")).toBeNull();
		expect(buildChatDraft(["u1"], "  ")).toBeNull();
	});

	it("trims the body and shapes recipients", () => {
		expect(buildChatDraft(["u1", "u1"], "  hello  ")).toEqual({
			recipients: [{ kind: "userId", userId: "u1" }],
			body: "hello",
		});
	});
});

describe("memberLabel", () => {
	const base: ComposeChatMember = {
		id: "abcd1234efgh",
		name: null,
		email: null,
	};
	it("prefers name, then email, then truncated id", () => {
		expect(memberLabel({ ...base, name: "Alice" })).toBe("Alice");
		expect(memberLabel({ ...base, email: "a@rox.one" })).toBe("a@rox.one");
		expect(memberLabel(base)).toBe("abcd1234");
	});
});

describe("filterMembers", () => {
	const members: ComposeChatMember[] = [
		{ id: "1", name: "Alice", email: "alice@rox.one" },
		{ id: "2", name: "Bob", email: "bob@example.com" },
	];
	it("returns all members for a blank query", () => {
		expect(filterMembers(members, "  ")).toHaveLength(2);
	});
	it("matches case-insensitively on name or email", () => {
		expect(filterMembers(members, "ALI").map((m) => m.id)).toEqual(["1"]);
		expect(filterMembers(members, "example").map((m) => m.id)).toEqual(["2"]);
	});
});
