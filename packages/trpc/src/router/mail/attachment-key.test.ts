import { describe, expect, test } from "bun:test";
import {
	isOwnedMailAttachmentKey,
	mailAttachmentKey,
	mailOutboundPrefix,
} from "./attachment-key";

const SHA = "a".repeat(64);

describe("mailOutboundPrefix", () => {
	test("is owner-scoped under mail/outbound/<userId>/", () => {
		expect(mailOutboundPrefix("user-1")).toBe("mail/outbound/user-1/");
	});
});

describe("mailAttachmentKey", () => {
	test("is content-addressed: owner prefix + lowercased sha256", () => {
		expect(mailAttachmentKey("user-1", SHA)).toBe(
			`mail/outbound/user-1/${SHA}`,
		);
	});

	test("lowercases an uppercase hash so re-staging the same bytes is idempotent", () => {
		expect(mailAttachmentKey("user-1", "A".repeat(64))).toBe(
			`mail/outbound/user-1/${SHA}`,
		);
	});
});

describe("isOwnedMailAttachmentKey", () => {
	test("accepts a key under the caller's own prefix", () => {
		expect(
			isOwnedMailAttachmentKey("user-1", `mail/outbound/user-1/${SHA}`),
		).toBe(true);
	});

	test("rejects a key under another user's prefix", () => {
		expect(
			isOwnedMailAttachmentKey("user-1", `mail/outbound/user-2/${SHA}`),
		).toBe(false);
	});

	test("rejects an arbitrary / drive key", () => {
		expect(isOwnedMailAttachmentKey("user-1", "u/user-1/whatever")).toBe(false);
		expect(isOwnedMailAttachmentKey("user-1", "")).toBe(false);
	});
});
