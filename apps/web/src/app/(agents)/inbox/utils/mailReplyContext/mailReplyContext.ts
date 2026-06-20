import type { RouterOutputs } from "@rox/trpc";

/** A single message row as returned by `mail.getThread`. */
export type MailThreadMessage =
	RouterOutputs["mail"]["getThread"]["messages"][number];
/** The thread row as returned by `mail.getThread`. */
export type MailThread = RouterOutputs["mail"]["getThread"]["thread"];

export interface MailReplyContext {
	/** Pre-filled recipient (the original sender), best-effort. */
	to: string;
	/** Reply subject with a single `Re:` prefix. */
	subject: string;
	/** RFC Message-ID this reply answers (In-Reply-To). */
	inReplyTo: string | null;
	/** Accumulated References chain for proper threading. */
	references: string[];
}

/** Normalize a subject to a single `Re:` prefix (idempotent). */
export function buildReplySubject(subject: string | null | undefined): string {
	const base = (subject ?? "").trim();
	const stripped = base.replace(/^(re:\s*)+/i, "").trim();
	return stripped ? `Re: ${stripped}` : "Re:";
}

/**
 * Derive reply headers from a thread + its messages.
 *
 * The recipient defaults to the most recent INBOUND sender (so replying answers
 * whoever last wrote to the user); when the thread is all-outbound we fall back
 * to the first recipient of the latest message. In-Reply-To points at the last
 * message's RFC Message-ID and the References chain is the accumulated ids plus
 * that id, de-duplicated and order-preserving.
 */
export function buildMailReplyContext(
	thread: MailThread | null,
	messages: readonly MailThreadMessage[],
): MailReplyContext {
	const last = messages.at(-1) ?? null;
	const lastInbound = [...messages]
		.reverse()
		.find((m) => m.direction === "inbound");

	const to =
		lastInbound?.fromAddr ?? last?.toAddrs?.[0] ?? last?.fromAddr ?? "";

	const subject = buildReplySubject(last?.subject ?? thread?.subjectNorm);

	const inReplyTo = last?.rfcMessageId ?? null;

	const refs = new Set<string>();
	for (const m of messages) {
		for (const r of m.referencesIds ?? []) {
			if (r) refs.add(r);
		}
		if (m.rfcMessageId) refs.add(m.rfcMessageId);
	}

	return {
		to,
		subject,
		inReplyTo,
		references: [...refs],
	};
}
