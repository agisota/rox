import { animate } from "framer-motion";
import { ease, motionDuration } from "./tokens";

/**
 * Tween an element's `scrollTop` from its current value to `top` using a short
 * framer-motion tween. When `shouldAnimate` is false (reduced motion / off),
 * it jumps instantly — same end state, no movement.
 *
 * Transform-free by nature: it only drives `scrollTop`, so it never reflows
 * layout or fights virtualization. Used by the Files tree reveal (case 048)
 * to replace the bare `scrollEl.scrollTop = …` jump with a smooth scroll.
 */
export function animateScrollTo(
	el: HTMLElement,
	top: number,
	shouldAnimate: boolean,
): void {
	if (!shouldAnimate) {
		el.scrollTop = top;
		return;
	}
	animate(el.scrollTop, top, {
		duration: motionDuration.slow,
		ease: ease.emphasized,
		onUpdate: (v) => {
			el.scrollTop = v;
		},
	});
}
