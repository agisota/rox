/**
 * PostHog session-replay configuration (openpanel epic, #35).
 *
 * Session recording is privacy-sensitive, so it ships **off** and is enabled
 * only behind an explicit env flag (`NEXT_PUBLIC_POSTHOG_SESSION_REPLAY`). Even
 * when enabled, recording is maximally masked — every form input AND all text
 * are masked — so a recording never captures typed content or on-screen PII by
 * default. Product can deliberately relax the masking later.
 *
 * This is a pure data builder (no `posthog-js` dependency) so it is trivially
 * unit-testable; the browser bundles just spread the result into `posthog.init`.
 */

/** The slice of `posthog-js` init options this module owns. */
export interface PosthogSessionReplayOptions {
	/** When true, posthog-js never starts session recording. */
	disable_session_recording: boolean;
	session_recording: {
		/** Mask every form input value in the recording. */
		maskAllInputs: boolean;
		/** CSS selector of text nodes to mask; "*" masks all on-screen text. */
		maskTextSelector: string;
	};
}

/**
 * Build the `posthog.init` session-replay options for the given enabled flag.
 * Recording is disabled unless `enabled` is true; masking is always maximal.
 */
export function posthogSessionReplayOptions(
	enabled: boolean,
): PosthogSessionReplayOptions {
	return {
		disable_session_recording: !enabled,
		session_recording: {
			maskAllInputs: true,
			maskTextSelector: "*",
		},
	};
}
