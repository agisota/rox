import type { MailThread, MailThreadMessage } from "./mailTypes";

/**
 * Reply-header derivation (ported from the web inbox `mailReplyContext`). Pure
 * + deterministic: given a thread and its messages it produces the prefilled
 * recipient, a single-`Re:` subject, and the RFC In-Reply-To / References chain
 * the `mail.send` mutation needs for correct threading.
 */
export interface MailReplyContext {
	/** Prefilled recipient (the last inbound sender), best-effort. */
	to: string;
	/** Reply subject with exactly one `Re:` prefix. */
	subject: string;
	/** RFC Message-ID this reply answers (In-Reply-To). */
	inReplyTo: string | null;
	/** Accumulated References chain, de-duplicated + order-preserving. */
	references: string[];
}

/** Normalize a subject to a single `Re:` prefix (idempotent). */
export function buildReplySubject(subject: string | null | undefined): string {
	const base = (subject ?? "").trim();
	const stripped = base.replace(/^(re:\s*)+/i, "").trim();
	return stripped ? `Re: ${stripped}` : "Re:";
}

/** Normalize a subject to a single `Fwd:` prefix (idempotent). */
export function buildForwardSubject(
	subject: string | null | undefined,
): string {
	const base = (subject ?? "").trim();
	const stripped = base.replace(/^((re|fwd):\s*)+/i, "").trim();
	return stripped ? `Fwd: ${stripped}` : "Fwd:";
}

/**
 * Derive reply headers from a thread + its messages.
 *
 * The recipient defaults to the most recent INBOUND sender (replying answers
 * whoever last wrote to the user); for an all-outbound thread we use the first
 * recipient of the latest message. In-Reply-To points at the last message's
 * RFC Message-ID; References is the accumulated ids plus that id.
 *
 * `replyAll` additionally folds every other participant (To/Cc of the latest
 * message, minus the user's own outbound addresses) into a comma list.
 */
export function buildMailReplyContext(
	thread: MailThread | null,
	messages: readonly MailThreadMessage[],
	options: { replyAll?: boolean } = {},
): MailReplyContext {
	const last = messages.at(-1) ?? null;
	const lastInbound = [...messages]
		.reverse()
		.find((m) => m.direction === "inbound");

	const primaryTo =
		lastInbound?.fromAddr ?? last?.toAddrs?.[0] ?? last?.fromAddr ?? "";

	let to = primaryTo;
	if (options.replyAll && last) {
		// Everyone the latest message was addressed to/cc'd, plus its sender,
		// minus the primary recipient (already first) and blanks. Order-preserving.
		const ours = new Set(
			messages
				.filter((m) => m.direction === "outbound")
				.map((m) => m.fromAddr?.trim().toLowerCase())
				.filter(Boolean) as string[],
		);
		const seen = new Set<string>([primaryTo.trim().toLowerCase()]);
		const extra: string[] = [];
		for (const addr of [
			last.fromAddr,
			...(last.toAddrs ?? []),
			...(last.ccAddrs ?? []),
		]) {
			const norm = addr?.trim();
			if (!norm) continue;
			const key = norm.toLowerCase();
			if (seen.has(key) || ours.has(key)) continue;
			seen.add(key);
			extra.push(norm);
		}
		to = [primaryTo, ...extra].filter(Boolean).join(", ");
	}

	const subject = buildReplySubject(last?.subject ?? thread?.subjectNorm);
	const inReplyTo = last?.rfcMessageId ?? null;

	const refs = new Set<string>();
	for (const m of messages) {
		for (const r of m.referencesIds ?? []) {
			if (r) refs.add(r);
		}
		if (m.rfcMessageId) refs.add(m.rfcMessageId);
	}

	return { to, subject, inReplyTo, references: [...refs] };
}
