/**
 * Drizzle-backed {@link ThreadAccessDb} — the live participant check for the
 * comms SSE auth gate (hardening epic). Kept separate from the pure
 * `thread-access.ts` so the gate logic unit-tests without a database.
 */

import { db } from "@rox/db/client";
import { commsParticipants } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import type { ThreadAccessDb } from "./thread-access";

/** Production gate db bound to the live Drizzle client. */
export function createThreadAccessDb(): ThreadAccessDb {
	return {
		async isThreadParticipant({ threadId, userId }) {
			const [row] = await db
				.select({ id: commsParticipants.id })
				.from(commsParticipants)
				.where(
					and(
						eq(commsParticipants.threadId, threadId),
						eq(commsParticipants.userId, userId),
					),
				)
				.limit(1);
			return Boolean(row);
		},
	};
}
