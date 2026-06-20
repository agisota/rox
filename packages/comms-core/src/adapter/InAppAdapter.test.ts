import { describe, expect, it } from "bun:test";
import { InAppAdapter } from "./InAppAdapter";

describe("InAppAdapter.normalizeInbound", () => {
	const adapter = new InAppAdapter();

	it("maps clientId to externalId and lowercases addresses", () => {
		const n = adapter.normalizeInbound({
			clientId: "c-1",
			from: "Mark@rox.one",
			to: ["Alice@external.com", "BOB@rox.one"],
			body: "hi",
		});
		expect(n.transport).toBe("inapp");
		expect(n.externalId).toBe("c-1");
		expect(n.from).toBe("mark@rox.one");
		expect(n.to).toEqual(["alice@external.com", "bob@rox.one"]);
		expect(n.subject).toBeNull();
	});

	it("carries the reply target and attachments", () => {
		const n = adapter.normalizeInbound({
			clientId: "c-2",
			from: "mark@rox.one",
			to: ["alice@external.com"],
			body: "see attached",
			inReplyTo: "c-1",
			attachments: [
				{ name: "a.png", url: "r2://x", contentType: "image/png", size: 10 },
			],
		});
		expect(n.inReplyToExternalId).toBe("c-1");
		expect(n.attachments).toHaveLength(1);
	});

	it("defaults to now for an invalid/absent sentAt", () => {
		const before = Date.now();
		const n = adapter.normalizeInbound({
			clientId: "c-3",
			from: "mark@rox.one",
			to: ["alice@external.com"],
			body: "x",
			sentAt: "not-a-date",
		});
		expect(n.createdAt.getTime()).toBeGreaterThanOrEqual(before);
	});
});

describe("InAppAdapter.send", () => {
	it("returns a deterministic in-app provider id", async () => {
		const adapter = new InAppAdapter();
		const res = await adapter.send(
			{
				organizationId: "org",
				authorUserId: "u",
				recipients: [],
				body: "x",
			},
			{
				toAddress: "bob@rox.one",
				delivery: { id: "d1", messageId: "m1", transport: "inapp" },
			},
		);
		expect(res.providerId).toBe("inapp:m1:d1");
	});
});
