/**
 * Ephemeral-sandbox lifecycle for the host-service runtime (remote-hosts epic,
 * #32). When host-service runs inside a managed sandbox with a fixed TTL, it
 * must reliably shut itself down at expiry so the relay drops the tunnel and
 * the `v2_hosts` row transitions offline — even if the provider's own TTL
 * enforcement lags. This module owns that single timer.
 */

/**
 * Largest delay `setTimeout` can represent (~24.8 days). Delays beyond this
 * silently wrap around and fire immediately, so we cap and re-arm in chunks.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface ScheduleSandboxExpiryOptions {
	/** Absolute instant at which the sandbox should expire. */
	expiresAt: Date;
	/** Invoked once, when expiry is reached. Wire this to a graceful shutdown. */
	onExpire: () => void;
	/** Injectable clock (ms since epoch). Defaults to `Date.now`. */
	now?: () => number;
	/** Injectable timer. Defaults to `setTimeout`. */
	setTimer?: (
		callback: () => void,
		ms: number,
	) => ReturnType<typeof setTimeout>;
	/** Injectable timer cancel. Defaults to `clearTimeout`. */
	clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface SandboxExpiryHandle {
	/** Cancel the pending expiry (e.g. when shutting down via another path). */
	cancel: () => void;
}

/**
 * Schedule a one-shot `onExpire` callback to fire at `expiresAt`. If the
 * instant is already in the past, `onExpire` fires synchronously. Long delays
 * are capped to `setTimeout`'s safe range and re-armed so multi-day TTLs don't
 * overflow.
 */
export function scheduleSandboxExpiry(
	options: ScheduleSandboxExpiryOptions,
): SandboxExpiryHandle {
	const now = options.now ?? (() => Date.now());
	const setTimer = options.setTimer ?? setTimeout;
	const clearTimer = options.clearTimer ?? clearTimeout;

	let handle: ReturnType<typeof setTimeout> | null = null;
	let fired = false;

	const arm = () => {
		if (fired) return;
		const remaining = options.expiresAt.getTime() - now();
		if (remaining <= 0) {
			fired = true;
			handle = null;
			options.onExpire();
			return;
		}
		handle = setTimer(arm, Math.min(remaining, MAX_TIMEOUT_MS));
	};

	arm();

	return {
		cancel: () => {
			fired = true;
			if (handle !== null) {
				clearTimer(handle);
				handle = null;
			}
		},
	};
}
