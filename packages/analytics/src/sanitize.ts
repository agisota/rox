/**
 * PII redaction / event sanitization (openpanel epic).
 *
 * Analytics payloads are assembled at hundreds of call sites and it is easy for
 * a raw email, token, or free-form prompt to slip into a property bag. This
 * module is the single, *pure* choke point that every emitter (client + server)
 * runs properties through before they leave the process.
 *
 * Design goals:
 * - Pure & dependency-free: trivially unit-testable, safe in any runtime.
 * - Conservative: redact by key name AND by value shape, so a token landing in
 *   an innocuously-named field is still caught.
 * - Non-destructive to analytics value: keys are kept (so funnels/counts still
 *   work) but their values are replaced with a stable `[redacted]` marker.
 */

/** Marker substituted in place of any redacted value. */
export const REDACTED = "[redacted]";

/**
 * Property keys whose *values* are always PII regardless of content.
 * Matched case-insensitively as a substring of the key, so `userEmail`,
 * `email_address`, and `EMAIL` all match `email`.
 */
const SENSITIVE_KEY_PATTERNS: readonly string[] = [
	"email",
	"password",
	"passwd",
	"secret",
	"token",
	"api_key",
	"apikey",
	"authorization",
	"auth_header",
	"access_key",
	"private_key",
	"client_secret",
	"phone",
	"ssn",
	"credit_card",
	"card_number",
	"first_name",
	"last_name",
	"full_name",
	"address",
];

/**
 * Keys that look name-ish but are safe analytics dimensions, so they must NOT
 * be caught by the broad `name`/`address` substring rules above. Checked first.
 */
const SAFE_KEY_EXACTS: ReadonlySet<string> = new Set([
	"name", // event/entity name, model name, agent_type — never a person's name
	"event_name",
	"app_name",
	"model_name",
	"workflow_name",
	"ip_address", // intentionally allowed; coarse-grained, not user-identifying here
]);

/** Email anywhere in a string. */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
/** Bearer/JWT-ish or long opaque secret tokens. */
const JWT_RE = /\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{6,}\b/i;
const BEARER_RE = /\bbearer\s+[a-z0-9._-]{8,}\b/i;
/** Common secret prefixes (Stripe, GitHub, OpenAI, Slack, generic sk-/pk-). */
const SECRET_PREFIX_RE =
	/\b(?:sk|pk|rk|ghp|gho|ghs|ghr|github_pat|xox[baprs]|AKIA)[-_][a-z0-9_-]{8,}\b/i;
/**
 * 13-19 digit card-number-shaped runs (allowing space/dash separators).
 * Anchored so the separator sits *between* digits (one digit consumed per
 * repetition) — this is linear-time and avoids the catastrophic backtracking
 * an optional trailing separator like `(?:\d[ -]?){13,19}` would introduce on
 * long digit-heavy strings (e.g. session ids).
 */
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/;

function keyIsSensitive(key: string): boolean {
	const lower = key.toLowerCase();
	if (SAFE_KEY_EXACTS.has(lower)) return false;
	return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function valueLooksSensitive(value: string): boolean {
	return (
		EMAIL_RE.test(value) ||
		JWT_RE.test(value) ||
		BEARER_RE.test(value) ||
		SECRET_PREFIX_RE.test(value) ||
		CARD_RE.test(value)
	);
}

/**
 * Redact PII from a single value. Strings are inspected for sensitive shapes;
 * non-strings pass through untouched (numbers/booleans/null can't carry the
 * patterns we guard against). Exposed for call sites that sanitize one field.
 */
export function redactValue(value: unknown): unknown {
	if (typeof value === "string" && valueLooksSensitive(value)) {
		return REDACTED;
	}
	return value;
}

export interface RedactOptions {
	/** Max recursion depth for nested objects/arrays. Default 4. */
	maxDepth?: number;
}

function redactInner(value: unknown, depth: number, maxDepth: number): unknown {
	if (depth > maxDepth) {
		// The depth cap exists to bound recursion (deep/cyclic structures), not to
		// destroy data. Collapse only objects/arrays we won't descend into; let
		// primitives still be scanned for sensitive shapes so a deep number/string
		// isn't falsely marked as PII.
		if (value !== null && typeof value === "object") return REDACTED;
		return redactValue(value);
	}

	if (Array.isArray(value)) {
		return value.map((item) => redactInner(item, depth + 1, maxDepth));
	}

	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
			if (keyIsSensitive(key)) {
				out[key] = REDACTED;
			} else {
				out[key] = redactInner(val, depth + 1, maxDepth);
			}
		}
		return out;
	}

	return redactValue(value);
}

/**
 * Recursively redact PII from an analytics property bag. Sensitive *keys* have
 * their value replaced wholesale; remaining string values are scanned for
 * sensitive *shapes* (emails, tokens, card numbers). Returns a new object —
 * the input is never mutated.
 */
export function redactPii(
	properties: Record<string, unknown> | undefined,
	options: RedactOptions = {},
): Record<string, unknown> {
	if (!properties) return {};
	const maxDepth = options.maxDepth ?? 4;
	return redactInner(properties, 0, maxDepth) as Record<string, unknown>;
}

/**
 * Sanitize a full analytics event (name + properties) before emission. The
 * event name is a fixed enum and never carries PII, so only properties are
 * scrubbed.
 */
export function sanitizeEvent<
	T extends { properties?: Record<string, unknown> },
>(event: T): T & { properties: Record<string, unknown> } {
	return { ...event, properties: redactPii(event.properties) };
}
