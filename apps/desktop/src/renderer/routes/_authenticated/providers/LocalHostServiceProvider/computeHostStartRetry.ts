import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";

/**
 * Maximum number of automatic start attempts before the provider stops retrying
 * on its own and leaves recovery to the user (via `HostStatusInline`'s connect).
 */
export const MAX_HOST_START_ATTEMPTS = 5;

/**
 * Base delay between automatic start attempts. The effective delay grows with
 * the attempt count (`base * 2^attempt`) so a host that keeps crashing on start
 * backs off instead of hammering the coordinator.
 */
export const HOST_START_RETRY_BASE_DELAY_MS = 2_000;

/** Cap so exponential backoff never stalls recovery for too long. */
export const HOST_START_RETRY_MAX_DELAY_MS = 30_000;

export interface HostStartRetryState {
	/** How many automatic start attempts have already been made. */
	attempts: number;
	/** Timestamp (ms epoch) of the last automatic attempt, or null if none yet. */
	lastAttemptAt: number | null;
}

export interface HostStartRetryInput {
	/** Whether a session token + active organization are available to start with. */
	canStart: boolean;
	/** Current readiness: host is reachable (`activeHostUrl !== null`). */
	hostReady: boolean;
	/** Current coordinator process/connection status. */
	status: HostServiceAvailabilityStatus;
	/** Retry bookkeeping accumulated so far. */
	state: HostStartRetryState;
	/** Injectable clock for deterministic tests. */
	now: number;
}

export interface HostStartRetryDecision {
	/** Whether the provider should fire the start mutation now. */
	shouldStart: boolean;
	/** The retry bookkeeping to persist after this evaluation. */
	nextState: HostStartRetryState;
}

const RETRYABLE_STATUSES: ReadonlySet<HostServiceAvailabilityStatus> = new Set([
	"stopped",
	"unknown",
]);

function backoffDelay(attempts: number): number {
	const delay = HOST_START_RETRY_BASE_DELAY_MS * 2 ** attempts;
	return Math.min(delay, HOST_START_RETRY_MAX_DELAY_MS);
}

/**
 * Decide whether to (re)issue the host-service start mutation, applying an
 * exponential backoff capped at {@link MAX_HOST_START_ATTEMPTS}.
 *
 * Resets the attempt counter as soon as the host is ready/running so a later
 * crash gets a fresh budget of retries. Pure so it can be unit-tested without
 * React or timers.
 */
export function computeHostStartRetry(
	input: HostStartRetryInput,
): HostStartRetryDecision {
	const { canStart, hostReady, status, state, now } = input;

	// Host is up: clear bookkeeping so a future stop starts from a clean budget.
	if (hostReady || status === "running") {
		return {
			shouldStart: false,
			nextState: { attempts: 0, lastAttemptAt: null },
		};
	}

	// Can't start yet (no session/token/org) — wait without consuming the budget.
	if (!canStart) {
		return { shouldStart: false, nextState: state };
	}

	// `starting` means a start is already in flight; let it settle.
	if (!RETRYABLE_STATUSES.has(status)) {
		return { shouldStart: false, nextState: state };
	}

	if (state.attempts >= MAX_HOST_START_ATTEMPTS) {
		return { shouldStart: false, nextState: state };
	}

	if (
		state.lastAttemptAt !== null &&
		now - state.lastAttemptAt < backoffDelay(state.attempts)
	) {
		return { shouldStart: false, nextState: state };
	}

	return {
		shouldStart: true,
		nextState: { attempts: state.attempts + 1, lastAttemptAt: now },
	};
}
