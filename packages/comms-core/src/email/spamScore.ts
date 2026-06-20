/**
 * Pure inbound spam scoring (D3 §"Spam scoring", T7).
 *
 * The Cloudflare Email Worker already default-rejects unknown handles and
 * SPF+DMARC hard-fails at the edge; everything else is POSTed so we keep the
 * message. This function turns the surviving auth verdicts + light heuristics
 * into a 0..100 score. At or above {@link DEFAULT_SPAM_THRESHOLD} the message is
 * `quarantined` (persisted but NOT emitted into the D1 unified inbox).
 *
 * SECURITY (PR #335 review, Fix #2): a verdict is only allowed to LOWER the
 * score when it is `pass` AND `trusted` (i.e. derived from an allowlisted
 * Authentication-Results authserv-id — see the inbound Worker's `readAuth`). A
 * sender can trivially forge `Authentication-Results: ...; dmarc=pass` on their
 * own message, so an UNTRUSTED pass is treated exactly like `unknown`: it never
 * grants the negative weight and is itself mildly suspicious. A single trusted
 * `dmarc=pass` never zeroes the score while SPF/DKIM are failing/unknown.
 *
 * Pure + dependency-free so it unit-tests trivially and runs on any server
 * target (API route, future Worker, cron).
 */

/** Tri-state per-check verdict (`pass`/`fail`/`unknown`). */
export type AuthVerdict = "pass" | "fail" | "unknown";

/**
 * Auth verdicts the edge Worker reports. `trusted` is true only when the
 * verdicts came from an allowlisted receiver identity (Cloudflare's own
 * Authentication-Results authserv-id); when false, every "pass" is unverified
 * and MUST NOT be rewarded.
 *
 * Booleans / null are accepted for back-compat (`true`→pass, `false`→fail,
 * `null`→unknown) and normalized internally.
 */
export interface SpamAuthSignals {
	spf: AuthVerdict | boolean | null;
	dkim: AuthVerdict | boolean | null;
	dmarc: AuthVerdict | boolean | null;
	/**
	 * Whether these verdicts came from a trusted receiver identity. Defaults to
	 * `false` (fail-closed): without proof of trust, a "pass" is unverified.
	 */
	trusted?: boolean;
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

/** Normalize the back-compat boolean/null inputs into a tri-state verdict. */
function toVerdict(
	value: AuthVerdict | boolean | null | undefined,
): AuthVerdict {
	if (value === true) return "pass";
	if (value === false) return "fail";
	if (value === "pass" || value === "fail") return value;
	return "unknown";
}

/**
 * Score an inbound message. Failed/unverified auth dominates; a verdict only
 * lowers risk when it is a TRUSTED pass. Content heuristics nudge. Clamped to
 * 0..100.
 *
 * Per-check weights (positive = more suspicious):
 *   - fail:                strongest signal
 *   - unknown / untrusted: moderately suspicious (cannot be vouched for)
 *   - trusted pass:        no penalty (the only "clean" state)
 */
export function scoreInboundSpam(
	input: SpamScoreInput,
	threshold: number = DEFAULT_SPAM_THRESHOLD,
): SpamScoreResult {
	let score = 0;
	const reasons: string[] = [];

	const trusted = input.auth.trusted === true;
	const spf = toVerdict(input.auth.spf);
	const dkim = toVerdict(input.auth.dkim);
	const dmarc = toVerdict(input.auth.dmarc);

	// A "pass" only counts as clean when it is backed by a trusted verdict.
	// Otherwise it is unverified (sender-forgeable) and treated like unknown.
	const effective = (v: AuthVerdict): AuthVerdict => {
		if (v === "pass" && !trusted) return "unknown";
		return v;
	};
	const spfEff = effective(spf);
	const dkimEff = effective(dkim);
	const dmarcEff = effective(dmarc);

	if (!trusted) {
		// No allowlisted authserv-id stamped these — the whole verdict block is
		// unverified. Flag it once so audits can see why a "pass" earned no credit.
		reasons.push("auth_untrusted");
	}

	// DMARC is the alignment gate: fail dominates; unverified/unknown is still
	// suspicious. A trusted pass earns NO negative weight on its own — it simply
	// avoids the penalty (SPF/DKIM below still stand on their own).
	if (dmarcEff === "fail") {
		score += 45;
		reasons.push("dmarc_fail");
	} else if (dmarcEff === "unknown") {
		score += 15;
		reasons.push("dmarc_unknown");
	}

	if (spfEff === "fail") {
		score += 20;
		reasons.push("spf_fail");
	} else if (spfEff === "unknown") {
		score += 10;
		reasons.push("spf_unknown");
	}

	if (dkimEff === "fail") {
		score += 20;
		reasons.push("dkim_fail");
	} else if (dkimEff === "unknown") {
		score += 10;
		reasons.push("dkim_unknown");
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
