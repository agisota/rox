/**
 * Derive the `mail.send` reply context from a loaded mail thread.
 *
 * Pure + platform-agnostic (web/desktop share the same mail reply contract):
 * given the thread's messages (chronological) and the mailbox owner's own
 * address, pick the message to reply to (the newest one), then compute the
 * recipient set, the `Re:` subject, and the RFC threading headers
 * (`inReplyTo` / `references`) the backend `mail.send` expects.
 *
 * Recipient rule: reply to the *other* party. For an inbound message that is
 * its `fromAddr`; for one of our own outbound messages it is the original
 * `toAddrs` (minus our own address). CC is carried over (minus self + the
 * primary recipients) so "reply all" stays coherent without a separate toggle.
 */

/** The mail-message fields this helper needs (subset of `SelectMailMessage`). */
export interface ReplySourceMessage {
	direction: string;
	fromAddr: string;
	toAddrs: string[];
	ccAddrs?: string[] | null;
	subject?: string | null;
	rfcMessageId?: string | null;
	inReplyTo?: string | null;
	referencesIds?: string[] | null;
}

export interface ReplyContext {
	/** Primary recipients for the reply. */
	to: string[];
	/** Carried-over CC recipients (deduped, self-excluded). */
	cc: string[];
	/** `Re:`-prefixed subject (no double prefix). */
	subject: string;
	/** RFC Message-ID the reply answers (sets In-Reply-To). May be null. */
	inReplyTo: string | null;
	/** Accumulated References chain for the reply. */
	references: string[];
}

/** Normalize an email for self-comparison (case-insensitive, trimmed). */
function norm(addr: string): string {
	return addr.trim().toLowerCase();
}

/** Prefix `Re:` once; keep an existing (case-insensitive) `Re:` as-is. */
export function buildReplySubject(subject: string | null | undefined): string {
	const trimmed = (subject ?? "").trim();
	if (trimmed.length === 0) return "Re:";
	if (/^re:/i.test(trimmed)) return trimmed;
	return `Re: ${trimmed}`;
}

/**
 * Compute the reply context for a thread. Returns `null` when there is no
 * message to reply to or no resolvable recipient.
 */
export function buildReplyContext(
	messages: ReplySourceMessage[],
	ownAddress: string | null | undefined,
): ReplyContext | null {
	if (messages.length === 0) return null;

	// Reply to the newest message in the thread.
	const target = messages[messages.length - 1];
	if (!target) return null;

	const self = ownAddress ? norm(ownAddress) : null;
	const isOutbound = target.direction === "outbound";

	// Other party = inbound sender, or (for our own outbound) its recipients.
	const rawTo = isOutbound ? target.toAddrs : [target.fromAddr];
	const to = dedupeExcludingSelf(rawTo, self);
	if (to.length === 0) return null;

	const toSet = new Set(to.map(norm));
	const cc = dedupeExcludingSelf(target.ccAddrs ?? [], self).filter(
		(addr) => !toSet.has(norm(addr)),
	);

	const references = [
		...(target.referencesIds ?? []),
		...(target.rfcMessageId ? [target.rfcMessageId] : []),
	];

	return {
		to,
		cc,
		subject: buildReplySubject(target.subject),
		inReplyTo: target.rfcMessageId ?? null,
		references,
	};
}

/** Trim, drop blanks, drop the owner's own address, and dedupe (stable order). */
function dedupeExcludingSelf(addrs: string[], self: string | null): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of addrs) {
		const trimmed = raw.trim();
		if (trimmed.length === 0) continue;
		const key = norm(trimmed);
		if (key === self) continue;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}
