"use client";

import { useEffect, useRef } from "react";
import styles from "./LandingBackdrop.module.css";

/**
 * LandingBackdrop — a premium, subtle 3D-depth scene rendered BEHIND the
 * landing copy. A dark IDE-style desktop window and an overlapping phone
 * mockup, composed in CSS 3D perspective space and lit by a single warm orange
 * key light, so the page background reads as the Rox app "floating" with real
 * depth (Spline / omma.build aesthetic) — not a flat gradient.
 *
 * Built entirely in CSS/markup (no image or texture assets). The parent mounts
 * it as the first child of a `position: relative` container and gives it a low
 * z-index; it is `pointer-events: none` and never captures clicks.
 *
 * Motion: on pointer move the scene tilts a few degrees via two CSS custom
 * properties (`--px` / `--py`), written through `requestAnimationFrame` so we
 * touch the DOM at most once per frame. Under `prefers-reduced-motion: reduce`
 * the listener is never attached, leaving a static, perfectly framed scene.
 *
 * Legibility is the hard constraint: overall layer opacity is capped low and a
 * vignette darkens the edges, so the headline + paragraphs on top stay fully
 * readable.
 */
export function LandingBackdrop() {
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		// Respect reduced-motion: no parallax wiring at all → static scene.
		if (
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		let frame = 0;
		let targetX = 0;
		let targetY = 0;

		const apply = () => {
			frame = 0;
			root.style.setProperty("--px", targetX.toFixed(4));
			root.style.setProperty("--py", targetY.toFixed(4));
		};

		const schedule = () => {
			if (frame === 0) frame = requestAnimationFrame(apply);
		};

		// Map the pointer to a normalized [-1, 1] range around the viewport
		// center; the CSS multiplies these into a few degrees / px of motion.
		const handlePointerMove = (event: PointerEvent) => {
			targetX = (event.clientX / window.innerWidth) * 2 - 1;
			targetY = (event.clientY / window.innerHeight) * 2 - 1;
			schedule();
		};

		// Ease back to the framed pose when the pointer leaves the window.
		const handlePointerLeave = () => {
			targetX = 0;
			targetY = 0;
			schedule();
		};

		window.addEventListener("pointermove", handlePointerMove, {
			passive: true,
		});
		document.addEventListener("pointerleave", handlePointerLeave);

		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			document.removeEventListener("pointerleave", handlePointerLeave);
			if (frame) cancelAnimationFrame(frame);
		};
	}, []);

	return (
		<div ref={rootRef} className={styles.backdrop} aria-hidden="true">
			{/* Far ambient key light, drifting with parallax. */}
			<div className={styles.glow} />

			{/* The tilted 3D stage holding both devices. */}
			<div className={styles.stage}>
				{/* Contact shadow / floor reflection beneath the rig. */}
				<div className={styles.floor} />

				{/* Desktop IDE window (pushed slightly back in depth). */}
				<div className={`${styles.device} ${styles.desktop}`}>
					<div className={styles.titleBar}>
						<span className={`${styles.dot} ${styles.dotR}`} />
						<span className={`${styles.dot} ${styles.dotY}`} />
						<span className={`${styles.dot} ${styles.dotG}`} />
						<span className={styles.titleChip} />
					</div>
					<div className={styles.body}>
						<div className={styles.sidebar}>
							<span className={styles.navItem} />
							<span className={styles.navItem} />
							<span className={styles.navActive} />
							<span className={styles.navItem} />
							<span className={styles.navItem} />
							<span className={styles.navItem} />
						</div>
						<div className={styles.content}>
							<span className={styles.line} />
							<span className={styles.line} />
							<span className={`${styles.line} ${styles.lineIndent}`} />
							<span className={`${styles.lineAccent} ${styles.lineIndent}`} />
							<span className={styles.line} />
							<span className={styles.line} />
							<span className={`${styles.line} ${styles.lineIndent}`} />
							<span className={`${styles.lineAccent} ${styles.lineIndent}`} />
							<span className={styles.line} />
						</div>
					</div>
				</div>

				{/* Phone mockup, overlapping IN FRONT of the desktop. */}
				<div className={`${styles.device} ${styles.phone}`}>
					<div className={styles.phoneScreen}>
						<span className={styles.notch} />
						<span className={styles.phoneHeader} />
						<span className={styles.phoneCard} />
						<span className={styles.phoneRow} />
						<span className={styles.phoneRow} />
						<span className={styles.phoneRow} />
						<span className={styles.phoneRow} />
					</div>
				</div>
			</div>

			{/* Edge vignette to deepen the scene and protect center legibility. */}
			<div className={styles.vignette} />
		</div>
	);
}
