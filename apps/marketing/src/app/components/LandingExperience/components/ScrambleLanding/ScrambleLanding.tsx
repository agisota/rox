"use client";

import { animate, scrambleText, utils } from "animejs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	LANDING_ACPX_TERM,
	LANDING_AGENT_LEAD,
	LANDING_AGENT_TAIL,
	LANDING_AGENT_TERMS,
	LANDING_DOWNLOAD_HEADING,
	LANDING_EDITOR_LEAD,
	LANDING_EDITOR_TERMS,
	LANDING_FEAT_CONTROL,
	LANDING_FEAT_ISOLATION,
	LANDING_FEAT_SPEED,
	LANDING_FEAT_SWITCH,
	LANDING_FEATURES_HEADING,
	LANDING_HEADLINE,
	LANDING_HOW_HEADING,
	LANDING_HOW_PARAGRAPH,
	LANDING_INTRO_PARAGRAPH,
} from "../../constants";
import { OrchestrationField } from "../OrchestrationField";
import { CommandConsole } from "./components/CommandConsole";
import { RoxDivider } from "./components/RoxDivider";
import { Term } from "./components/Term";

interface ScrambleLandingProps {
	children?: React.ReactNode;
}

/**
 * Scramble-text landing document, ported from Julian Garnier's anime.js v4
 * "Scramble Text playground" (codepen gbLOvrw) into Rox branding, then upgraded
 * for a premium feel:
 *
 *  - **Scroll-reveal scramble**: each line scrambles into place as it enters the
 *    viewport (IntersectionObserver one-shot), so the document "types" itself as
 *    you scroll instead of all at once on mount.
 *  - **Living background**: the brand radial glow slowly breathes via animated
 *    CSS custom properties.
 *  - **SVG dividers**: hairline rules between sections draw themselves in on
 *    scroll.
 *
 * Real copy is server-rendered (SEO / no-JS); anime.js only scrambles then
 * restores it. Hovering any line re-scrambles it. Everything is scoped to the
 * container ref and skipped entirely under `prefers-reduced-motion`.
 */
export function ScrambleLanding({ children }: ScrambleLandingProps) {
	const containerRef = useRef<HTMLElement>(null);
	const animationsRef = useRef<
		Array<{ cancel?: () => void; revert?: () => void }>
	>([]);

	// Each dispatched command bumps this counter, which the orchestration field
	// watches to fire a "pulse" (rings expand, spin and flash, then re-coalesce).
	const [pulse, setPulse] = useState(0);
	const handleDispatch = useCallback(() => setPulse((value) => value + 1), []);

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

		const cleanups: Array<() => void> = [];
		const trackAnimation = <
			T extends { cancel?: () => void; revert?: () => void },
		>(
			animation: T,
		) => {
			animationsRef.current.push(animation);
			return animation;
		};
		const cleanupAnimations = () => {
			for (const animation of animationsRef.current) {
				animation.cancel?.();
				animation.revert?.();
			}
			animationsRef.current = [];
		};

		// ── C. Living background: slow breathing of the brand glow ──────────
		trackAnimation(
			animate(container, {
				"--rox-glow-a": [0.12, 0.2],
				"--rox-glow-y": ["-8%", "-3%"],
				loop: true,
				alternate: true,
				duration: 6000,
				ease: "inOut(2)",
			}),
		);

		// ── A. Scroll-reveal scramble (one-shot per line) + hover re-scramble
		const scrambleEls = Array.from(
			container.querySelectorAll<HTMLElement>(".rox-scramble"),
		);

		const revealScramble = (element: HTMLElement) => {
			trackAnimation(
				animate(element, {
					innerHTML: scrambleText({
						override: "",
						duration: 750,
						settleDuration: 250,
						perturbation: 0.2,
						cursor: "░▒▓█",
					}),
				}),
			);
		};

		const revealObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						revealScramble(entry.target as HTMLElement);
						revealObserver.unobserve(entry.target);
					}
				}
			},
			{ rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
		);

		for (const element of scrambleEls) {
			revealObserver.observe(element);
			const replay = () => {
				trackAnimation(
					animate(element, { innerHTML: scrambleText({ duration: 500 }) }),
				);
			};
			element.addEventListener("pointerenter", replay);
			element.addEventListener("pointerdown", replay);
			cleanups.push(() => {
				element.removeEventListener("pointerenter", replay);
				element.removeEventListener("pointerdown", replay);
			});
		}
		cleanups.push(() => revealObserver.disconnect());

		// ── E. SVG dividers draw themselves in on scroll ────────────────────
		const dividers = Array.from(
			container.querySelectorAll<SVGLineElement>(".rox-divider__line"),
		);
		const drawObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						trackAnimation(
							animate(entry.target, {
								strokeDashoffset: [1, 0],
								ease: "inOut(3)",
								duration: 900,
							}),
						);
						drawObserver.unobserve(entry.target);
					}
				}
			},
			{ rootMargin: "0px 0px -10% 0px", threshold: 0.5 },
		);
		for (const line of dividers) {
			// Pathless hairline: dash the whole length, offset it, then draw to 0.
			utils.set(line, { strokeDasharray: 1, strokeDashoffset: 1 });
			drawObserver.observe(line);
		}
		cleanups.push(() => drawObserver.disconnect());

		return () => {
			for (const cleanup of cleanups) cleanup();
			cleanupAnimations();
		};
	}, []);

	return (
		<main ref={containerRef} className="rox-anime rox-landing">
			<OrchestrationField pulse={pulse} />

			<section className="rox-hero">
				<div className="rox-hero__inner">
					<div className="rox-landing__brand">
						<span aria-hidden="true">▸</span>
						<span className="rox-scramble">Rox One</span>
					</div>

					<h1 className="rox-scramble rox-hero__headline">
						{LANDING_HEADLINE}
					</h1>

					<p className="rox-scramble rox-hero__sub">
						{LANDING_INTRO_PARAGRAPH}
					</p>

					<CommandConsole onDispatch={handleDispatch} />

					<a className="rox-landing__hero-cta" href="/download">
						Скачать для macOS
						<span aria-hidden="true">↓</span>
					</a>
				</div>

				<span className="rox-hero__scroll" aria-hidden="true">
					Листай ниже
				</span>
			</section>

			<div className="rox-landing__main">
				<h2 className="rox-scramble">{LANDING_FEATURES_HEADING}</h2>

				<ul>
					<li className="rox-scramble">{LANDING_FEAT_SPEED}</li>
					<li>
						{LANDING_AGENT_LEAD}{" "}
						{LANDING_AGENT_TERMS.map((term, index) => (
							<span key={term.label}>
								{index > 0 ? ", " : ""}
								<Term label={term.label} tip={term.tip} />
							</span>
						))}
						{LANDING_AGENT_TAIL}
						<Term label={LANDING_ACPX_TERM.label} tip={LANDING_ACPX_TERM.tip} />
					</li>
					<li className="rox-scramble">{LANDING_FEAT_ISOLATION}</li>
					<li className="rox-scramble">{LANDING_FEAT_CONTROL}</li>
					<li>
						{LANDING_EDITOR_LEAD}{" "}
						{LANDING_EDITOR_TERMS.map((term, index) => (
							<span key={term.label}>
								{index > 0 ? ", " : ""}
								<Term label={term.label} tip={term.tip} />
							</span>
						))}
					</li>
					<li className="rox-scramble">{LANDING_FEAT_SWITCH}</li>
				</ul>

				<RoxDivider />

				<h2 className="rox-scramble">{LANDING_HOW_HEADING}</h2>

				<p className="rox-scramble">{LANDING_HOW_PARAGRAPH}</p>

				<RoxDivider />

				<h2 className="rox-scramble">{LANDING_DOWNLOAD_HEADING}</h2>

				<div className="rox-landing__cta">{children}</div>
			</div>
		</main>
	);
}
