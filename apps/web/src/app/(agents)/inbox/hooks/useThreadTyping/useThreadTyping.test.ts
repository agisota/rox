// Register happy-dom's DOM globals BEFORE @testing-library/* is imported. This
// is a side-effecting import — keep it FIRST (see WorkingPromptComposer.test).
import "../../../../../../happydom";

import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";

import { TYPING_IDLE_MS, useThreadTyping } from "./useThreadTyping";

/**
 * `useThreadTyping` is the shared throttle/idle contract both inbox clients
 * (web Composer + desktop ChatTab) depend on. We drive the REAL hook via
 * `renderHook` and inject a deterministic fake timer queue through the
 * `scheduleTimer`/`cancelTimer` seams (no real waiting, no module mocks), so
 * the assertions exercise the production logic exactly:
 *
 *   • first non-empty keystroke fires `onTypingChange(true)` once,
 *   • a second keystroke while already typing does NOT re-fire true,
 *   • the idle timer firing reports `false`,
 *   • `stop()` reports `false` immediately and cancels the pending timer.
 */
describe("useThreadTyping", () => {
	afterEach(() => {
		cleanup();
	});

	/** A manual timer queue: one pending callback at a time (the hook resets it). */
	function makeFakeTimers() {
		let pending: (() => void) | null = null;
		let nextId = 1;
		const scheduleTimer = mock((cb: () => void, _ms: number) => {
			pending = cb;
			return nextId++ as unknown as ReturnType<typeof setTimeout>;
		});
		const cancelTimer = mock((_id: ReturnType<typeof setTimeout>) => {
			pending = null;
		});
		const flush = () => {
			const cb = pending;
			pending = null;
			cb?.();
		};
		return {
			scheduleTimer,
			cancelTimer,
			flush,
			hasPending: () => pending !== null,
		};
	}

	test("exposes the agreed idle window (2500ms)", () => {
		expect(TYPING_IDLE_MS).toBe(2500);
	});

	test("fires onTypingChange(true) once on the first non-empty keystroke", () => {
		const calls: boolean[] = [];
		const timers = makeFakeTimers();
		const { result } = renderHook(() =>
			useThreadTyping((typing) => calls.push(typing), {
				scheduleTimer: timers.scheduleTimer,
				cancelTimer: timers.cancelTimer,
			}),
		);

		act(() => result.current.onChange("h"));
		act(() => result.current.onChange("he"));

		// Only one `true` even after two keystrokes; the idle timer is armed.
		expect(calls).toEqual([true]);
		expect(timers.hasPending()).toBe(true);
	});

	test("does not fire true for an empty value (cleared field)", () => {
		const calls: boolean[] = [];
		const timers = makeFakeTimers();
		const { result } = renderHook(() =>
			useThreadTyping((typing) => calls.push(typing), {
				scheduleTimer: timers.scheduleTimer,
				cancelTimer: timers.cancelTimer,
			}),
		);

		act(() => result.current.onChange(""));

		expect(calls).toEqual([]);
	});

	test("reports false after the idle window elapses", () => {
		const calls: boolean[] = [];
		const timers = makeFakeTimers();
		const { result } = renderHook(() =>
			useThreadTyping((typing) => calls.push(typing), {
				scheduleTimer: timers.scheduleTimer,
				cancelTimer: timers.cancelTimer,
			}),
		);

		act(() => result.current.onChange("hi"));
		expect(calls).toEqual([true]);

		act(() => timers.flush());

		expect(calls).toEqual([true, false]);
	});

	test("stop() reports false immediately and cancels the pending timer", () => {
		const calls: boolean[] = [];
		const timers = makeFakeTimers();
		const { result } = renderHook(() =>
			useThreadTyping((typing) => calls.push(typing), {
				scheduleTimer: timers.scheduleTimer,
				cancelTimer: timers.cancelTimer,
			}),
		);

		act(() => result.current.onChange("hi"));
		expect(timers.hasPending()).toBe(true);

		act(() => result.current.stop());

		expect(calls).toEqual([true, false]);
		expect(timers.hasPending()).toBe(false);
		expect(timers.cancelTimer).toHaveBeenCalled();
	});

	test("stop() is a no-op when not currently typing", () => {
		const calls: boolean[] = [];
		const timers = makeFakeTimers();
		const { result } = renderHook(() =>
			useThreadTyping((typing) => calls.push(typing), {
				scheduleTimer: timers.scheduleTimer,
				cancelTimer: timers.cancelTimer,
			}),
		);

		act(() => result.current.stop());

		expect(calls).toEqual([]);
	});

	test("re-arms true after a stop (next keystroke starts a fresh typing session)", () => {
		const calls: boolean[] = [];
		const timers = makeFakeTimers();
		const { result } = renderHook(() =>
			useThreadTyping((typing) => calls.push(typing), {
				scheduleTimer: timers.scheduleTimer,
				cancelTimer: timers.cancelTimer,
			}),
		);

		act(() => result.current.onChange("a"));
		act(() => result.current.stop());
		act(() => result.current.onChange("b"));

		expect(calls).toEqual([true, false, true]);
	});

	test("tolerates a missing onTypingChange (inert composer)", () => {
		const timers = makeFakeTimers();
		const { result } = renderHook(() =>
			useThreadTyping(undefined, {
				scheduleTimer: timers.scheduleTimer,
				cancelTimer: timers.cancelTimer,
			}),
		);

		// Must not throw when there is no listener wired.
		expect(() => {
			act(() => result.current.onChange("x"));
			act(() => result.current.stop());
		}).not.toThrow();
	});
});
