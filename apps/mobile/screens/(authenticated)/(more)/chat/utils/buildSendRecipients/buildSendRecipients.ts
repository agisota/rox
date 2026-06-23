/** A thread participant, reduced to the only field send-recipient derivation needs. */
export interface RecipientParticipant {
	/** The participant's rox user id, or null for an external contact node. */
	userId: string | null;
}

/** A `sendMessage` recipient ref by rox user id (the only kind chat reply uses). */
export interface UserIdRecipient {
	kind: "userId";
	userId: string;
}

/**
 * Derive the `comms.sendMessage` recipient set for a reply within an existing
 * thread: every participant that is a rox user, excluding the caller and any
 * external (null-userId) participants, deduped.
 *
 * `comms.sendMessage` REQUIRES at least one recipient even when appending to an
 * existing thread (schema.ts:40), so the thread screen disables Send when this
 * returns `[]` rather than firing a guaranteed 400. Mirrors web ThreadView's
 * `recipientUserIds` derivation (ThreadView.tsx:123-125). Pure + RN-free so it is
 * unit-testable without a renderer.
 */
export function buildSendRecipients(
	participants: readonly RecipientParticipant[],
	currentUserId: string | undefined,
): UserIdRecipient[] {
	const seen = new Set<string>();
	const recipients: UserIdRecipient[] = [];
	for (const participant of participants) {
		const userId = participant.userId;
		if (!userId) continue;
		if (userId === currentUserId) continue;
		if (seen.has(userId)) continue;
		seen.add(userId);
		recipients.push({ kind: "userId", userId });
	}
	return recipients;
}
