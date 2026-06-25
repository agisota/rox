/**
 * @rox/comms-core — chat-compose recipient selection (D1).
 *
 * Pure, framework-agnostic helpers backing the "Новая переписка" (new chat)
 * composer across surfaces (desktop/web/mobile). They keep the recipient
 * contract — selecting org members and shaping them into the `RecipientRef[]`
 * that `comms.sendMessage` expects — in shared core so every client reuses the
 * same selection semantics rather than re-deriving them per platform.
 *
 * No React, no transport: callers feed an org-members list + a selected-id set
 * and receive validated `RecipientRef[]`. Persistence/sending stays in the
 * tRPC `comms.sendMessage` mutation.
 */

import type { RecipientRef } from "../types";

/**
 * The minimal org-member shape a recipient picker needs. Mirrors the
 * `organization.members.list` projection (id/name/email/image) so a surface can
 * pass that query result straight through.
 */
export interface ComposeChatMember {
	/** rox user id (a `userId` recipient ref). */
	id: string;
	name: string | null;
	email: string | null;
	image?: string | null;
}

/** Validated input for starting a new chat thread. */
export interface ComposeChatDraft {
	recipients: RecipientRef[];
	body: string;
}

/**
 * Toggle a member id in a selection set (immutable). Returns a new `Set` so
 * React state updates stay referentially honest across platforms.
 */
export function toggleRecipient(
	selected: ReadonlySet<string>,
	userId: string,
): Set<string> {
	const next = new Set(selected);
	if (next.has(userId)) next.delete(userId);
	else next.add(userId);
	return next;
}

/**
 * Shape selected member ids into the `userId` recipient refs `comms.sendMessage`
 * accepts. Dedupes and preserves the order ids first appear in `selectedIds`.
 */
export function buildChatRecipients(
	selectedIds: Iterable<string>,
): RecipientRef[] {
	const seen = new Set<string>();
	const recipients: RecipientRef[] = [];
	for (const userId of selectedIds) {
		if (!userId || seen.has(userId)) continue;
		seen.add(userId);
		recipients.push({ kind: "userId", userId });
	}
	return recipients;
}

/**
 * Whether a draft can be sent: at least one recipient and a non-empty body.
 */
export function canSendChatDraft(
	selectedIds: Iterable<string>,
	body: string,
): boolean {
	return buildChatRecipients(selectedIds).length > 0 && body.trim().length > 0;
}

/**
 * Build a validated `ComposeChatDraft`, or `null` when the input is incomplete.
 * Single chokepoint so every surface enforces the same send precondition.
 */
export function buildChatDraft(
	selectedIds: Iterable<string>,
	body: string,
): ComposeChatDraft | null {
	const recipients = buildChatRecipients(selectedIds);
	const trimmed = body.trim();
	if (recipients.length === 0 || trimmed.length === 0) return null;
	return { recipients, body: trimmed };
}

/**
 * A member's display label for the picker (name, falling back to email, then a
 * truncated id). Shared so list + selected-chip rendering stay consistent.
 */
export function memberLabel(member: ComposeChatMember): string {
	return member.name?.trim() || member.email?.trim() || member.id.slice(0, 8);
}

/**
 * Case-insensitive filter over name/email for the picker search box. Returns
 * the input unchanged when the query is blank.
 */
export function filterMembers<T extends ComposeChatMember>(
	members: readonly T[],
	query: string,
): T[] {
	const q = query.trim().toLowerCase();
	if (q.length === 0) return [...members];
	return members.filter((m) => {
		const name = m.name?.toLowerCase() ?? "";
		const email = m.email?.toLowerCase() ?? "";
		return name.includes(q) || email.includes(q);
	});
}
