/**
 * First-touch attribution cookie (openpanel epic, #35).
 *
 * The capture layer (`./utm`) reads UTM params from the landing URL; this module
 * is the durable bridge to the server: the browser serializes first-touch
 * attribution into a single cookie, and the better-auth account-creation hook
 * reads it back to persist a `user_attribution` row. Pure (no DOM/Node) so both
 * sides share one format and it is trivially unit-testable.
 */

import { type UtmParams, utmToAnalyticsTraits } from "./utm";

/** Name of the first-touch attribution cookie set by the browser apps. */
export const ATTRIBUTION_COOKIE_NAME = "rox_attribution";

/** Upper bound per stored field, to keep the cookie + DB row small. */
const MAX_FIELD_LENGTH = 512;

/** First-touch acquisition signals captured on the landing page. */
export interface FirstTouchAttribution {
	utm: UtmParams;
	landingPage?: string;
	referrer?: string;
}

function cap(value: string): string {
	return value.slice(0, MAX_FIELD_LENGTH);
}

/** UTM trait key (snake_case, as stored) → {@link UtmParams} field. */
const UTM_TRAIT_TO_FIELD: ReadonlyArray<readonly [string, keyof UtmParams]> = [
	["utm_source", "utmSource"],
	["utm_medium", "utmMedium"],
	["utm_campaign", "utmCampaign"],
	["utm_term", "utmTerm"],
	["utm_content", "utmContent"],
];

/** Serialize first-touch attribution into the cookie value (JSON, snake_case). */
export function buildAttributionCookieValue(
	input: FirstTouchAttribution,
): string {
	const payload: Record<string, string> = {
		...utmToAnalyticsTraits(input.utm),
	};
	if (input.landingPage) payload.landing_page = cap(input.landingPage);
	if (input.referrer) payload.referrer = cap(input.referrer);
	return JSON.stringify(payload);
}

/**
 * Parse the attribution cookie value back into {@link FirstTouchAttribution}.
 * Tolerates url-encoding and returns `null` for missing/blank/non-object/garbage
 * values — never throws.
 */
export function parseAttributionCookieValue(
	value: string | null | undefined,
): FirstTouchAttribution | null {
	if (!value) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(decodeURIComponent(value));
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return null;
	}
	const record = parsed as Record<string, unknown>;
	const utm: UtmParams = {};
	for (const [trait, field] of UTM_TRAIT_TO_FIELD) {
		const raw = record[trait];
		if (typeof raw === "string" && raw.length > 0) utm[field] = cap(raw);
	}
	const out: FirstTouchAttribution = { utm };
	if (
		typeof record.landing_page === "string" &&
		record.landing_page.length > 0
	) {
		out.landingPage = cap(record.landing_page);
	}
	if (typeof record.referrer === "string" && record.referrer.length > 0) {
		out.referrer = cap(record.referrer);
	}
	return out;
}

/**
 * Read one cookie's raw (still url-encoded) value out of a `Cookie` request
 * header. Returns `undefined` when absent.
 */
export function parseCookieHeader(
	header: string | null | undefined,
	name: string,
): string | undefined {
	if (!header) return undefined;
	for (const part of header.split(";")) {
		const eq = part.indexOf("=");
		if (eq < 0) continue;
		if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
	}
	return undefined;
}
