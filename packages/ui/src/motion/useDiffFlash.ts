import { useEffect, useRef, useState } from "react";
import { useShouldAnimate } from "./useMotionPreference";

const FLASH_DURATION_MS = 700;

/**
 * Returns a transient CSS class ('odw-diff-flash') on the CodeView root for
 * ~700 ms after `key` changes (e.g. the diff content/ref changes), then clears.
 *
 * The flash CSS in useDiffCodeViewTheme scopes the @keyframes animation to this
 * host class so virtualized rows scrolled in later do NOT re-flash.
 *
 * Returns '' immediately when decorative motion is disabled.
 */
export function useDiffFlash(key: string): { flashClass: string } {
	const canAnimate = useShouldAnimate("decorative");
	const [flashClass, setFlashClass] = useState<string>("");
	const prevKeyRef = useRef<string | undefined>(undefined);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		if (!canAnimate) {
			setFlashClass("");
			return;
		}
		// Skip first mount — no previous key to compare against.
		if (prevKeyRef.current === undefined) {
			prevKeyRef.current = key;
			return;
		}
		if (prevKeyRef.current === key) return;
		prevKeyRef.current = key;

		// Arm the flash for the duration, then clear.
		setFlashClass("odw-diff-flash");
		if (timerRef.current !== undefined) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setFlashClass(""), FLASH_DURATION_MS);
	}, [key, canAnimate]);

	// Clear the timeout on unmount.
	useEffect(
		() => () => {
			if (timerRef.current !== undefined) clearTimeout(timerRef.current);
		},
		[],
	);

	return { flashClass };
}
