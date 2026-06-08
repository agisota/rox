import { BaseRetryPolicy } from "@zap-studio/retry";
import type {
	RetryDecision,
	RetryDecisionInput,
} from "@zap-studio/retry/types";

/**
 * Configuration accepted by {@link withRetry}.
 *
 * Every field is optional; unset fields fall back to {@link DEFAULT_RETRY_POLICY}.
 * This is a thin, repo-friendly options shape — not the lower-level
 * `RetryPolicy` contract from `@zap-studio/retry`.
 */
export interface RetryPolicy {
	/** Maximum number of attempts, including the first. */
	maxAttempts?: number;
	/** Initial backoff delay in ms, doubled each retry up to `maxDelayMs`. */
	baseDelayMs?: number;
	/** Hard upper bound in ms for the computed exponential delay. */
	maxDelayMs?: number;
	/**
	 * Predicate deciding whether a thrown error is worth retrying.
	 * Defaults to {@link isRetryableError}.
	 */
	isRetryable?: (error: unknown) => boolean;
	/**
	 * Delay implementation used between attempts. Tests inject an instant
	 * sleep here to avoid real timers.
	 */
	sleep?: (delayMs: number) => Promise<void>;
	/** Abort signal forwarded to the underlying retry runner. */
	signal?: AbortSignal;
}

interface ResolvedRetryPolicy {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	isRetryable: (error: unknown) => boolean;
}

/**
 * Extracts an HTTP status code from common error shapes
 * (`error.status`, `error.statusCode`, `error.response.status`).
 */
function getStatusCode(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const record = error as Record<string, unknown>;
	const direct = record.status ?? record.statusCode;
	if (typeof direct === "number") return direct;
	const response = record.response;
	if (typeof response === "object" && response !== null) {
		const status = (response as Record<string, unknown>).status;
		if (typeof status === "number") return status;
	}
	return undefined;
}

/**
 * Default retryability classifier.
 *
 * - No status (network failure / timeout / unknown) → retry.
 * - `429 Too Many Requests` → retry.
 * - `5xx` transient server errors → retry.
 * - Any other `4xx` → do not retry (permanent client error).
 */
export function isRetryableError(error: unknown): boolean {
	const status = getStatusCode(error);
	if (status === undefined) return true;
	if (status === 429) return true;
	if (status >= 500) return true;
	return false;
}

/** Default policy applied when callers omit options. */
export const DEFAULT_RETRY_POLICY: ResolvedRetryPolicy = {
	maxAttempts: 3,
	baseDelayMs: 200,
	maxDelayMs: 5_000,
	isRetryable: isRetryableError,
};

/**
 * Combines exponential backoff with error classification so the runner only
 * retries failures the caller considers transient.
 */
class WithRetryPolicy extends BaseRetryPolicy {
	private readonly config: ResolvedRetryPolicy;

	constructor(config: ResolvedRetryPolicy) {
		super();
		this.config = config;
	}

	next(input: RetryDecisionInput): RetryDecision {
		const { attempt, error } = input;
		if (attempt >= this.config.maxAttempts) {
			return { shouldRetry: false, delayMs: 0, reason: "max-attempts-reached" };
		}
		if (error !== undefined && !this.config.isRetryable(error)) {
			return { shouldRetry: false, delayMs: 0, reason: "policy-declined" };
		}
		const exponent = Math.max(0, attempt - 1);
		const delayMs = Math.min(
			this.config.maxDelayMs,
			this.config.baseDelayMs * 2 ** exponent,
		);
		return { shouldRetry: true, delayMs, reason: "retry" };
	}
}

/**
 * Runs `fn` with the project's retry policy when the `ZAP_STUDIO_RETRY_ENABLED`
 * flag is set, otherwise calls `fn` exactly once (true passthrough — zero
 * behavior change while the pilot is gated off).
 *
 * When enabled, transient failures are retried with exponential backoff per the
 * resolved {@link RetryPolicy}; exhausting all attempts re-throws a `RetryError`
 * carrying the last failure on `.lastError`.
 *
 * @param fn - Async operation to execute (and retry on transient failure).
 * @param policy - Optional overrides for the default retry behavior.
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	policy?: RetryPolicy,
): Promise<T> {
	const enabled = process.env.ZAP_STUDIO_RETRY_ENABLED === "true";
	if (!enabled) return fn();

	const config: ResolvedRetryPolicy = {
		maxAttempts: policy?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
		baseDelayMs: policy?.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs,
		maxDelayMs: policy?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
		isRetryable: policy?.isRetryable ?? DEFAULT_RETRY_POLICY.isRetryable,
	};

	const runner = new WithRetryPolicy(config);
	return runner.run(() => fn(), {
		sleep: policy?.sleep,
		signal: policy?.signal,
	});
}
