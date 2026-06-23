/**
 * Auth-scoping for the comms SSE stream (hardening epic).
 *
 * LEAK SURFACE: a user must NEVER receive a live event for a thread they don't
 * participate in. The event bus is a dumb fan-out, so the gate lives here: given
 * a candidate event and the connected user, decide whether to forward it.
 *
 * The decision is authoritative — it is NOT derived from any publisher-supplied
 * participant set (a publisher could be stale or wrong). It checks
 * `comms_participants` via the injected {@link ThreadAccessDb}, scoped to the
 * thread + user, so the only way to receive a thread's events is to actually be a
 * row in that thread. The org match is a cheap pre-filter; participation is the
 * real gate.
 *
 * This module is intentionally db-free (pure decision logic + a port type) so it
 * unit-tests against a fake with no live database. The Drizzle-backed port lives
 * in `thread-access-db.ts`.
 */

/** The db surface the gate needs — satisfied by the real Drizzle client + fakes. */
export interface ThreadAccessDb {
	isThreadParticipant(args: {
		threadId: string;
		userId: string;
	}): Promise<boolean>;
}

/**
 * Decide whether `userId` (a member of `userOrgIds`) may receive an event for
 * `(organizationId, threadId)`. Returns false unless BOTH hold:
 *   1. the event's org is one the caller belongs to (cheap pre-filter), AND
 *   2. the caller is a participant row on the thread (authoritative DB check).
 */
export async function canReceiveCommsEvent(
	gateDb: ThreadAccessDb,
	args: {
		userId: string;
		userOrgIds: ReadonlySet<string>;
		event: { organizationId: string; threadId: string };
	},
): Promise<boolean> {
	if (!args.userOrgIds.has(args.event.organizationId)) return false;
	return gateDb.isThreadParticipant({
		threadId: args.event.threadId,
		userId: args.userId,
	});
}
