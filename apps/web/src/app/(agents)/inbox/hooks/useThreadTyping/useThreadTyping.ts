"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Idle window after the last keystroke before typing presence is auto-cleared.
 * Shared by both inbox clients so web and desktop broadcast typing identically.
 */
export const TYPING_IDLE_MS = 2500;

/** Injectable timer seam — defaults to the global timers; tests pass fakes. */
export interface UseThreadTypingOptions {
	/** Idle window override (defaults to {@link TYPING_IDLE_MS}). */
	idleMs?: number;
	/** Schedule the idle callback (defaults to `setTimeout`). */
	scheduleTimer?: (
		callback: () => void,
		ms: number,
	) => ReturnType<typeof setTimeout>;
	/** Cancel a scheduled idle callback (defaults to `clearTimeout`). */
	cancelTimer?: (id: ReturnType<typeof setTimeout>) => void;
}

export interface ThreadTypingControls {
	/**
	 * Feed the composer's current value on every change. Fires
	 * `onTypingChange(true)` once when typing begins and re-arms the idle timer,
	 * which fires `onTypingChange(false)` after {@link TYPING_IDLE_MS} of silence.
	 */
	onChange: (value: string) => void;
	/**
	 * Immediately end the typing session: fires `onTypingChange(false)` (only if
	 * currently typing) and clears the pending idle timer. Call on send and on
	 * thread switch / unmount.
	 */
	stop: () => void;
}

/**
 * Debounced typing-presence controller, extracted from the inbox `Composer` so
 * both the web composer and the desktop ChatTab broadcast typing through the
 * exact same throttle. Returns `{ onChange, stop }`; `onTypingChange` is
 * optional so a composer with no presence layer wired stays fully functional.
 *
 * The timer functions are injectable purely as a test seam — in the app they
 * default to the global `setTimeout`/`clearTimeout`.
 */
export function useThreadTyping(
	onTypingChange?: (typing: boolean) => void,
	options?: UseThreadTypingOptions,
): ThreadTypingControls {
	const idleMs = options?.idleMs ?? TYPING_IDLE_MS;
	const schedule = options?.scheduleTimer ?? setTimeout;
	const cancel = options?.cancelTimer ?? clearTimeout;

	const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isTypingRef = useRef(false);

	// Keep mutable callbacks in refs so `onChange`/`stop` stay stable across
	// renders (the composer wires `onChange` directly to a textarea).
	const onTypingChangeRef = useRef(onTypingChange);
	onTypingChangeRef.current = onTypingChange;
	const scheduleRef = useRef(schedule);
	scheduleRef.current = schedule;
	const cancelRef = useRef(cancel);
	cancelRef.current = cancel;
	const idleMsRef = useRef(idleMs);
	idleMsRef.current = idleMs;

	const stop = useCallback(() => {
		if (typingTimer.current !== null) {
			cancelRef.current(typingTimer.current);
			typingTimer.current = null;
		}
		if (isTypingRef.current) {
			isTypingRef.current = false;
			onTypingChangeRef.current?.(false);
		}
	}, []);

	const onChange = useCallback(
		(value: string) => {
			if (!isTypingRef.current && value.length > 0) {
				isTypingRef.current = true;
				onTypingChangeRef.current?.(true);
			}
			if (typingTimer.current !== null) cancelRef.current(typingTimer.current);
			typingTimer.current = scheduleRef.current(stop, idleMsRef.current);
		},
		[stop],
	);

	// Clear any pending typing timer on unmount / thread switch.
	useEffect(() => stop, [stop]);

	return { onChange, stop };
}
