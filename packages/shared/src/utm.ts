/**
 * UTM capture — pure, dependency-free parsing of marketing attribution
 * parameters from a landing URL (openpanel epic, #35).
 *
 * The acquisition signal lives in the `utm_*` query parameters of the URL a
 * visitor first lands on. This module turns that raw query into a normalized,
 * length-bounded {@link UtmParams} object and into analytics trait keys, so the
 * browser apps (web / marketing) can attach first-touch attribution to their
 * analytics `identify` calls without each re-implementing the parsing.
 *
 * It is intentionally free of DOM/Node/analytics dependencies: it takes a string
 * / `URL` / `URLSearchParams` in and returns plain data, so it is trivially
 * unit-testable and safe to import from any client bundle. Persisting the
 * captured values (cookie + auth account-creation hook → `user_attribution`) is
 * a separate, server-side concern layered on top of this.
 */

/** First-touch UTM parameters, camelCased to mirror the DB attribution columns. */
export interface UtmParams {
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
	utmTerm?: string;
	utmContent?: string;
}

/** Upper bound on a single captured value, to cap storage/analytics payloads. */
export const MAX_UTM_VALUE_LENGTH = 256;

/** Query-param name → {@link UtmParams} field. The full set of standard UTMs. */
const UTM_FIELDS: ReadonlyArray<readonly [string, keyof UtmParams]> = [
	["utm_source", "utmSource"],
	["utm_medium", "utmMedium"],
	["utm_campaign", "utmCampaign"],
	["utm_term", "utmTerm"],
	["utm_content", "utmContent"],
];

function toSearchParams(
	input: string | URL | URLSearchParams,
): URLSearchParams {
	if (input instanceof URLSearchParams) return input;
	if (input instanceof URL) return input.searchParams;
	// A string may be a full URL, a "?a=b" query, or a bare "a=b&c=d". Take
	// everything after the first "?" (or the whole string when there is none),
	// which URLSearchParams then url-decodes.
	const queryStart = input.indexOf("?");
	const query = queryStart >= 0 ? input.slice(queryStart + 1) : input;
	return new URLSearchParams(query);
}

/**
 * Parse the standard `utm_*` parameters out of a landing URL / query / params.
 * Values are url-decoded (by `URLSearchParams`), trimmed, capped to
 * {@link MAX_UTM_VALUE_LENGTH}, and blank values are dropped. Only present,
 * non-empty fields appear on the returned object.
 */
export function parseUtmParams(
	input: string | URL | URLSearchParams,
): UtmParams {
	const params = toSearchParams(input);
	const out: UtmParams = {};
	for (const [param, field] of UTM_FIELDS) {
		const raw = params.get(param);
		if (raw === null) continue;
		const value = raw.trim().slice(0, MAX_UTM_VALUE_LENGTH);
		if (value.length === 0) continue;
		out[field] = value;
	}
	return out;
}

/**
 * Convert parsed {@link UtmParams} into analytics trait keys (snake_case,
 * matching the `utm_*` convention used across the event catalog). Only present
 * fields are emitted, so spreading the result into an identify/track payload is
 * a no-op when there is no attribution.
 */
export function utmToAnalyticsTraits(utm: UtmParams): Record<string, string> {
	const traits: Record<string, string> = {};
	for (const [param, field] of UTM_FIELDS) {
		const value = utm[field];
		if (value) traits[param] = value;
	}
	return traits;
}

/** Whether any UTM field carries a value. */
export function hasUtm(utm: UtmParams): boolean {
	return UTM_FIELDS.some(([, field]) => Boolean(utm[field]));
}
