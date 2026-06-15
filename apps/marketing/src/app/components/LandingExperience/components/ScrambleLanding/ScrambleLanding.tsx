"use client";

import { animate, createTimeline, scrambleText } from "animejs";
import { useEffect, useRef } from "react";
import {
	LANDING_DOWNLOAD_HEADING,
	LANDING_FEATURES,
	LANDING_FEATURES_HEADING,
	LANDING_HEADLINE,
	LANDING_HOW_HEADING,
	LANDING_HOW_PARAGRAPH,
	LANDING_INTRO_PARAGRAPH,
} from "../../constants";

interface ScrambleLandingProps {
	children?: React.ReactNode;
}

/**
 * Scramble-text landing document, ported from Julian Garnier's anime.js v4
 * "Scramble Text playground" (codepen gbLOvrw) into Rox branding.
 *
 * The real copy is server-rendered in the JSX below (SEO / no-JS), and anime.js
 * only scrambles then restores it on mount. Each `.rox-scramble` element plays a
 * staggered intro scramble, then re-scrambles on `pointerenter` / `pointerdown`.
 * Everything is scoped to a container ref so it never touches the rest of the
 * page, and the effect is skipped entirely under `prefers-reduced-motion`.
 */
export function ScrambleLanding({ children }: ScrambleLandingProps) {
	const containerRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Respect reduced-motion: leave the (already rendered) text static.
		if (
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		const elements = Array.from(
			container.querySelectorAll<HTMLElement>(".rox-scramble"),
		);
		if (elements.length === 0) return;

		const intro = createTimeline({ delay: 500 });
		const cleanups: Array<() => void> = [];

		for (const element of elements) {
			const replay = () => {
				animate(element, {
					innerHTML: scrambleText({ duration: 500 }),
				});
			};

			intro.add(
				element,
				{
					innerHTML: scrambleText({
						override: "",
						duration: 750,
						settleDuration: 250,
						perturbation: 0.2,
						cursor: "░▒▓█",
					}),
				},
				"-=620",
			);

			element.addEventListener("pointerenter", replay);
			element.addEventListener("pointerdown", replay);
			cleanups.push(() => {
				element.removeEventListener("pointerenter", replay);
				element.removeEventListener("pointerdown", replay);
			});
		}

		intro.init();

		return () => {
			for (const cleanup of cleanups) cleanup();
			intro.pause();
			intro.revert();
		};
	}, []);

	return (
		<main ref={containerRef} className="rox-anime rox-landing">
			<div className="rox-landing__main">
				<div className="rox-landing__brand">
					<span aria-hidden="true">▸</span>
					<span className="rox-scramble">Rox One</span>
				</div>

				<h1 className="rox-scramble">{LANDING_HEADLINE}</h1>

				<p className="rox-scramble">{LANDING_INTRO_PARAGRAPH}</p>

				<h2 className="rox-scramble">{LANDING_FEATURES_HEADING}</h2>

				<ul>
					{LANDING_FEATURES.map((feature) => (
						<li key={feature} className="rox-scramble">
							{feature}
						</li>
					))}
				</ul>

				<h2 className="rox-scramble">{LANDING_HOW_HEADING}</h2>

				<p className="rox-scramble">{LANDING_HOW_PARAGRAPH}</p>

				<h2 className="rox-scramble">{LANDING_DOWNLOAD_HEADING}</h2>

				<div className="rox-landing__cta">{children}</div>
			</div>
		</main>
	);
}
