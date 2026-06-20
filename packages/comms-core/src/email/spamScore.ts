/**
 * Pure inbound spam scoring (D3 §"Spam scoring", T7).
 *
 * The Cloudflare Email Worker already default-rejects unknown handles and
 * SPF+DMARC hard-fails at the edge; everything else is POSTed so we keep the
 * message. This function turns the surviving auth verdicts + light heuristics
 * into a 0..100 score. At or above {@link DEFAULT_SPAM_THRESHOLD} the message is
 * `quarantined` (persisted but NOT emitted into the D1 unified inbox).
 *
 * Pure + dependency-free so it unit-tests trivially and runs on any server
 * target (API route, future Worker, cron).
 */

/** Auth verdicts the edge Worker reports (null = unknown / not evaluated). */
export interface SpamAuthSignals {
	spf: boolean | null;
	dkim: boolean | null;
	dmarc: boolean | null;
}

/** Light content signals the ingest extracts from the envelope. */
export interface SpamContentSignals {
	subject?: string | null;
	snippet?: string | null;
	/** Number of recipients on the envelope (bulk blasts score higher). */
	recipientCount?: number;
}

export interface SpamScoreInput extends SpamContentSignals {
	auth: SpamAuthSignals;
}

export interface SpamScoreResult {
	/** 0 (clean) .. 100 (certain spam). */
	score: number;
	/** True when `score >= threshold` ⇒ quarantine, not inbox. */
	quarantined: boolean;
	/** Human-readable reasons that contributed, for audit/debug. */
	reasons: string[];
}

/** Quarantine at or above this score. */
export const DEFAULT_SPAM_THRESHOLD = 60;

const SPAMMY_PATTERNS: ReadonlyArray<RegExp> = [
	/\bviagra\b/i,
	/\bfree\s+money\b/i,
	/\bwin(ner)?\b.*\$\d/i,
	/\bcrypto\s+giveaway\b/i,
	/\bnigerian?\s+prince\b/i,
	/\bclick\s+here\s+now\b/i,
];

/**
 * Score an inbound message. Failed/absent auth dominates; content heuristics
 * nudge. Clamped to 0..100.
 */
export function scoreInboundSpam(
	input: SpamScoreInput,
	threshold: number = DEFAULT_SPAM_THRESHOLD,
): SpamScoreResult {
	let score = 0;
	const reasons: string[] = [];

	const { spf, dkim, dmarc } = input.auth;

	// Hard auth failures are the strongest signal.
	if (dmarc === false) {
		score += 45;
		reasons.push("dmarc_fail");
	} else if (dmarc === null) {
		score += 10;
		reasons.push("dmarc_unknown");
	}
	if (spf === false) {
		score += 20;
		reasons.push("spf_fail");
	}
	if (dkim === false) {
		score += 20;
		reasons.push("dkim_fail");
	}

	// Content heuristics (cheap, conservative).
	const text = `${input.subject ?? ""} ${input.snippet ?? ""}`;
	for (const pattern of SPAMMY_PATTERNS) {
		if (pattern.test(text)) {
			score += 15;
			reasons.push("spammy_content");
			break;
		}
	}

	if ((input.recipientCount ?? 0) > 25) {
		score += 10;
		reasons.push("bulk_recipients");
	}

	score = Math.max(0, Math.min(100, score));
	return { score, quarantined: score >= threshold, reasons };
}
