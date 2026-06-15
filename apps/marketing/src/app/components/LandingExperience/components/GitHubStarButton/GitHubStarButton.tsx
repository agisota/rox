"use client";

import { COMPANY } from "@rox/shared/constants";
import { animate, createTimeline, utils } from "animejs";
import { useEffect, useRef } from "react";
import { STAR_LABEL_DONE, STAR_LABEL_IDLE } from "../../constants";

interface GitHubStarButtonProps {
	targetCount: number;
}

/** Localised thousands formatter for the final, settled star count (RU). */
const numberFormatter = new Intl.NumberFormat("ru-RU");

/**
 * Animated GitHub "Star" button, ported from Julian Garnier's anime.js v4
 * "Timeline 50K stars" pen into Rox branding.
 *
 * On mount the community counter rises from a smaller number up to
 * `targetCount` (the live star count, passed from the server) while gold star
 * particles burst out of the icon and the button pulses; the label flips to
 * "Starred" and the icon polygon fills gold as the count settles. The button is
 * a plain anchor to the Rox repo, so clicking it just navigates (no
 * preventDefault). All anime.js work is scoped to the wrapper ref, reverted on
 * cleanup, and skipped under `prefers-reduced-motion`.
 */
export function GitHubStarButton({ targetCount }: GitHubStarButtonProps) {
	const wrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;

		const button = wrap.querySelector<HTMLAnchorElement>(".rox-star__button");
		const icon = wrap.querySelector<SVGSVGElement>(".rox-star__icon");
		const word = wrap.querySelector<HTMLElement>(".rox-star__word");
		const count = wrap.querySelector<HTMLElement>(".rox-star__count");
		const polygon = icon?.querySelector("polygon") ?? null;
		if (!button || !icon || !word || !count) return;

		const startCount = Math.max(1, Math.round(targetCount * 0.85));

		// Respect reduced-motion: skip particles/timeline, show the settled state.
		if (
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			count.innerHTML = numberFormatter.format(targetCount);
			word.textContent = STAR_LABEL_DONE;
			polygon?.setAttribute("fill", "currentColor");
			return;
		}

		// Reset to the idle state (StrictMode re-runs this effect cleanly).
		count.innerHTML = String(startCount);
		word.textContent = STAR_LABEL_IDLE;
		polygon?.setAttribute("fill", "none");

		const particles: Element[] = [];

		/** Spawn one gold star that floats up out of the icon and fades away. */
		const burst = () => {
			const clone = icon.cloneNode(true) as SVGSVGElement;
			clone.classList.add("rox-star__particle");
			wrap.appendChild(clone);
			particles.push(clone);

			const drift = utils.random(-40, 40);
			animate(clone, {
				translateY: { to: utils.random(-175, -225), ease: "out" },
				translateX: [
					{ to: utils.random(-40, 40), ease: "out" },
					{ to: drift, ease: "inOut(2)" },
				],
				scale: [1, 1.2, 1, 0.8],
				opacity: { to: 0, ease: "inOut(2)" },
				duration: utils.random(900, 1300),
				onComplete: () => {
					clone.remove();
					const at = particles.indexOf(clone);
					if (at !== -1) particles.splice(at, 1);
				},
			});
		};

		// Counter rise + button pulse + polygon fill pop, plus periodic bursts.
		const timeline = createTimeline()
			.call(() => {
				word.textContent = STAR_LABEL_DONE;
				polygon?.setAttribute("fill", "currentColor");
			}, 0)
			.add(
				button,
				{
					scale: [1, 0.97, 1.02, 1],
					ease: "out(3)",
					duration: 900,
				},
				0,
			)
			.add(
				polygon ?? icon,
				{
					scale: [1, 1.35, 1],
					ease: "out(3)",
					duration: 700,
				},
				0,
			)
			.add(
				count,
				{
					innerHTML: [String(startCount), String(targetCount)],
					modifier: utils.round(0),
					ease: "cubicBezier(0.2, 0.9, 0.1, 1)",
					duration: 2200,
					onComplete: () => {
						// Swap the raw integer for the localised thousands form.
						count.innerHTML = numberFormatter.format(targetCount);
					},
				},
				0,
			);

		// Several bursts staggered across the rise, then settle.
		for (let i = 0; i < 6; i++) {
			timeline.call(burst, i * 280);
		}

		timeline.init();

		return () => {
			timeline.pause();
			timeline.revert();
			for (const particle of particles.splice(0)) particle.remove();
		};
	}, [targetCount]);

	return (
		<div ref={wrapRef} className="rox-star">
			<a
				className="rox-star__button"
				href={COMPANY.GITHUB_URL}
				target="_blank"
				rel="noopener noreferrer"
			>
				<svg
					className="rox-star__icon"
					width="36"
					height="36"
					viewBox="0 0 36 36"
					aria-hidden="true"
				>
					<polygon
						points="8.76 32.64 10.39 22.29 3 15.01 13.4 13.43 18 4 22.6 13.43 33 15.01 25.61 22.22 27.24 32.64 18 27.79"
						stroke="currentColor"
						strokeWidth="3"
						fill="none"
					/>
				</svg>
				<span className="rox-star__label">
					<span className="rox-star__word">{STAR_LABEL_IDLE}</span>
				</span>
				<span className="rox-star__count">
					{Math.max(1, Math.round(targetCount * 0.85))}
				</span>
			</a>
		</div>
	);
}
