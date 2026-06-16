import { describe, expect, it } from "bun:test";
import { posthogSessionReplayOptions } from "./posthog-session-replay";

describe("posthogSessionReplayOptions", () => {
	it("disables session recording when the flag is off", () => {
		expect(posthogSessionReplayOptions(false).disable_session_recording).toBe(
			true,
		);
	});

	it("enables session recording when the flag is on", () => {
		expect(posthogSessionReplayOptions(true).disable_session_recording).toBe(
			false,
		);
	});

	it("always masks all inputs and all text, regardless of the flag", () => {
		for (const enabled of [true, false]) {
			const { session_recording } = posthogSessionReplayOptions(enabled);
			expect(session_recording.maskAllInputs).toBe(true);
			expect(session_recording.maskTextSelector).toBe("*");
		}
	});
});
