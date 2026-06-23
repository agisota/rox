import { describe, expect, test } from "bun:test";

import { canReceiveCommsEvent, type ThreadAccessDb } from "./thread-access";

/**
 * LEAK-SURFACE tests for the comms SSE auth gate. The single rule under test: a
 * user receives a thread's live event ONLY when they belong to the event's org
 * AND are a participant row on the thread. Org match alone is never enough; the
 * participant check is authoritative.
 */

/** A fake gate db: a fixed set of `(threadId, userId)` participant pairs. */
function fakeGateDb(
	participants: ReadonlyArray<[string, string]>,
): ThreadAccessDb {
	const set = new Set(participants.map(([t, u]) => `${t}::${u}`));
	return {
		async isThreadParticipant({ threadId, userId }) {
			return set.has(`${threadId}::${userId}`);
		},
	};
}

const ORG = "org-1";
const THREAD = "thread-1";
const MEMBER = "user-member";
const OUTSIDER = "user-outsider";

describe("canReceiveCommsEvent", () => {
	test("forwards to a thread participant in the event's org", async () => {
		const gateDb = fakeGateDb([[THREAD, MEMBER]]);
		const allowed = await canReceiveCommsEvent(gateDb, {
			userId: MEMBER,
			userOrgIds: new Set([ORG]),
			event: { organizationId: ORG, threadId: THREAD },
		});
		expect(allowed).toBe(true);
	});

	test("BLOCKS a non-participant even when they share the org", async () => {
		// The outsider is in the same org but NOT a participant of the thread.
		const gateDb = fakeGateDb([[THREAD, MEMBER]]);
		const allowed = await canReceiveCommsEvent(gateDb, {
			userId: OUTSIDER,
			userOrgIds: new Set([ORG]),
			event: { organizationId: ORG, threadId: THREAD },
		});
		expect(allowed).toBe(false);
	});

	test("BLOCKS an event for an org the caller does not belong to", async () => {
		// Even a participant row cannot leak across an org the caller isn't in
		// (the org pre-filter rejects before the participant check).
		const gateDb = fakeGateDb([[THREAD, MEMBER]]);
		const allowed = await canReceiveCommsEvent(gateDb, {
			userId: MEMBER,
			userOrgIds: new Set(["some-other-org"]),
			event: { organizationId: ORG, threadId: THREAD },
		});
		expect(allowed).toBe(false);
	});

	test("does not trust a publisher-supplied set — only the db participant row", async () => {
		// The gate never reads `participantUserIds`; it asks the db. An empty db
		// means no one is forwarded, regardless of what a publisher claimed.
		const emptyGateDb = fakeGateDb([]);
		const allowed = await canReceiveCommsEvent(emptyGateDb, {
			userId: MEMBER,
			userOrgIds: new Set([ORG]),
			event: { organizationId: ORG, threadId: THREAD },
		});
		expect(allowed).toBe(false);
	});
});
