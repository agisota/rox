"use client";

import { animate, createTimeline, scrambleText, stagger } from "animejs";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { INTRO_LANGS, INTRO_LEAD_WORD } from "../../constants";

interface IntroOverlayProps {
	onComplete: () => void;
}

/**
 * Lead-word grid for slide 1: a diamond distribution (2-3-4-5-4-3-2) that fills
 * the screen with "Introducing" across many languages, with the centered word
 * singled out for the brand reveal. Precomputed with stable string ids so React
 * keys never use the array index (keeps Biome's noArrayIndexKey happy).
 */
const SLIDE_ONE_GRID = [2, 3, 4, 5, 4, 3, 2] as const;
const CENTER_ROW_INDEX = 3;
const CENTER_COL_INDEX = 2;

let langCursor = 0;
const SLIDE_ONE_ROWS = SLIDE_ONE_GRID.map((count, rowIndex) => ({
	id: `intro-row-${rowIndex}`,
	cells: Array.from({ length: count }, (_, colIndex) => {
		const isCenter =
			rowIndex === CENTER_ROW_INDEX && colIndex === CENTER_COL_INDEX;
		const word = isCenter
			? INTRO_LEAD_WORD
			: INTRO_LANGS[langCursor++ % INTRO_LANGS.length];
		return { id: `intro-cell-${rowIndex}-${colIndex}`, isCenter, word };
	}),
}));

/** anime.js grid hint for the radial scramble wave across the lead-word grid. */
const GRID_COLS = Math.max(...SLIDE_ONE_GRID);
const GRID_ROWS = SLIDE_ONE_GRID.length;

/** Scramble cursor glyphs reused from the original anime.js demo. */
const CURSOR_HEAVY = "░▒▓█";
const CURSOR_LIGHT = "░▒▓";

/** Hard ceiling so onComplete always fires even if the timeline stalls. */
const SAFETY_TIMEOUT_MS = 18_000;
/** Min on-screen time for the intro (logo holds out the remainder). */
const MIN_INTRO_DURATION_MS = 8_100;

/** Delay the independent logo float until the one-shot reveal tween has landed. */
const LOGO_FLOAT_DELAY_MS = 2_200;
/** Start the breathing glow loop only after the reveal one-shot has settled. */
const LOGO_GLOW_LOOP_DELAY_MS = 4_500;

/**
 * Fullscreen one-shot intro: fills the screen with «Представляем» / «Introducing»
 * across many languages, collapses it into the ROX wordmark, then reveals the
 * Rox girl mark — centered, enlarged, with a breathing glow — and holds it
 * before handing off to the hero. Ports Julian Garnier's "Scramble Text
 * timeline" CodePen onto the Rox palette.
 */
export function IntroOverlay({ onComplete }: IntroOverlayProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const onCompleteRef = useRef(onComplete);
	onCompleteRef.current = onComplete;

	useEffect(() => {
		const root = rootRef.current;
		if (!root) {
			return;
		}
		root.setAttribute("data-intro-js", "enhanced");

		const introStartedAt = window.performance.now();
		let finished = false;
		let finishQueued = false;
		const fallbackTimers: number[] = [];
		const queueFallbackTimer = (callback: () => void, delay: number) => {
			const timer = window.setTimeout(callback, delay);
			fallbackTimers.push(timer);
		};
		const completeNow = () => {
			if (finished) {
				return;
			}
			finished = true;
			// Smooth cross-fade: fade the overlay out over the still-mounted hero
			// underneath, then unmount via onComplete.
			root.style.transition = "opacity 600ms ease";
			root.style.opacity = "0";
			root.style.pointerEvents = "none";
			window.setTimeout(() => {
				root.style.visibility = "hidden";
				onCompleteRef.current();
			}, 560);
		};
		const finishOnce = () => {
			if (finished || finishQueued) {
				return;
			}
			const remainingIntroTime =
				MIN_INTRO_DURATION_MS - (window.performance.now() - introStartedAt);
			if (remainingIntroTime > 0) {
				finishQueued = true;
				queueFallbackTimer(() => {
					finishQueued = false;
					finishOnce();
				}, remainingIntroTime);
				return;
			}
			completeNow();
		};

		const select = <T extends Element>(selector: string): T[] =>
			Array.from(root.querySelectorAll<T>(selector));

		const slide1 = select<HTMLElement>(".rox-intro__slide--one");
		const slide1Center = select<HTMLElement>(
			".rox-intro__slide--one .rox-intro__center",
		);
		const slide1Flank = select<HTMLElement>(
			".rox-intro__slide--one .rox-intro__flank",
		);
		const logo = select<HTMLElement>(".rox-intro__logo");
		const logoImg = select<HTMLElement>(".rox-intro__logo img");

		const timeline = createTimeline({
			loop: false,
			onComplete: finishOnce,
		});

		// ── Slide 1: multilingual word grid collapses into the ROX wordmark,
		//    then the girl mark is revealed and held centered on screen. ──
		timeline
			.add(slide1, {
				opacity: { to: 1, duration: 250, ease: "linear" },
				scale: [{ from: 0.78, to: 1, duration: 1600, ease: "inOut(3.5)" }],
				ease: "inOut(3)",
			})
			.add(
				slide1Center,
				{
					scale: { from: 3 },
					color: { from: "var(--rox-c-1)", to: "var(--rox-orange-1)" },
					innerHTML: scrambleText({
						override: " ",
						ease: "inQuad",
						duration: 500,
						from: "center",
						cursor: CURSOR_HEAVY,
					}),
				},
				"<<",
			)
			.add(root, { backgroundColor: "#000" }, "<<+=50")
			.add(
				slide1Flank,
				{
					scale: { from: 0.7 },
					color: { to: "var(--rox-orange-2)" },
					innerHTML: scrambleText({
						override: " ",
						from: "center",
						duration: 500,
						revealDelay: 200,
						cursor: CURSOR_LIGHT,
						perturbation: 0.25,
					}),
				},
				stagger([200, 800], {
					grid: [GRID_COLS, GRID_ROWS],
					from: "center",
					ease: "out(3)",
					start: "<<",
				}),
			)
			.add(
				slide1Flank,
				{
					scale: 0.5,
					opacity: 0,
					innerHTML: scrambleText({
						text: "",
						override: false,
						from: "center",
						ease: "outQuad",
						reversed: true,
						duration: 800,
						cursor: CURSOR_LIGHT,
					}),
				},
				stagger([0, 500], {
					grid: [GRID_COLS, GRID_ROWS],
					from: "center",
					ease: "in(2)",
					start: "<+=200",
				}),
			)
			.add(
				slide1Center,
				{
					scale: 2.4,
					opacity: { to: 0 },
					color: { to: "var(--rox-c-2)" },
					ease: "inOutExpo",
					duration: 1500,
					innerHTML: scrambleText({
						override: " ",
						ease: "inQuad",
						from: "center",
						duration: 900,
						perturbation: 0.25,
					}),
				},
				"<<",
			)
			.add(logo, { opacity: { to: 1 }, ease: "out(2)", duration: 700 }, "<<")
			.add(
				logoImg,
				{
					scale: [0.8, 1],
					ease: "out(3)",
					duration: 900,
				},
				"<<",
			)
			.add(
				logo,
				{
					"--rox-logo-blur": ["8px", "0px"],
					"--rox-logo-glow-a": [0, 0.9, 0.78],
					"--rox-logo-glow-scale": [0.6, 1.08, 1],
					ease: "out(2)",
					duration: 1000,
				},
				"<<",
			)
			// Hold the girl on screen so the intro breathes before the handoff.
			// The breathing glow + float loops run during this hold and the
			// MIN_INTRO_DURATION floor wait that follows.
			.add(slide1, { opacity: 0, duration: 1 }, "<+=400")
			.add(logo, { opacity: 1, duration: 2600 }, "<<");

		timeline.init();
		timeline.restart();
		timeline.play();

		// Hard floor: always complete after the minimum on-screen time.
		queueFallbackTimer(completeNow, MIN_INTRO_DURATION_MS);
		// If the word grid never showed (anime failed to start), reveal the girl
		// directly so the screen is never empty.
		queueFallbackTimer(() => {
			if (finished) return;
			const slideOneOpacity = Number.parseFloat(
				slide1[0] ? getComputedStyle(slide1[0]).opacity : "0",
			);
			const logoOpacity = Number.parseFloat(
				logo[0] ? getComputedStyle(logo[0]).opacity : "0",
			);
			if (slideOneOpacity < 0.05 && logoOpacity < 0.05 && logo[0]) {
				logo[0].style.opacity = "1";
			}
		}, 1200);

		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		let logoFloat: { revert: () => void } | null = null;
		let logoGlow: { revert: () => void } | null = null;
		const logoFloatDelay = prefersReducedMotion
			? undefined
			: window.setTimeout(() => {
					logoFloat = animate(logoImg, {
						translateY: [-4, 4],
						loop: true,
						alternate: true,
						duration: 3500,
						ease: "inOut(2)",
					});
				}, LOGO_FLOAT_DELAY_MS);
		const logoGlowDelay = prefersReducedMotion
			? undefined
			: window.setTimeout(() => {
					logoGlow = animate(logo, {
						"--rox-logo-glow-a": [0.62, 0.96],
						"--rox-logo-glow-scale": [1.0, 1.14],
						loop: true,
						alternate: true,
						duration: 2200,
						ease: "inOut(2)",
					});
				}, LOGO_GLOW_LOOP_DELAY_MS);

		const safety = window.setTimeout(finishOnce, SAFETY_TIMEOUT_MS);

		return () => {
			window.clearTimeout(safety);
			for (const timer of fallbackTimers) {
				window.clearTimeout(timer);
			}
			if (logoFloatDelay !== undefined) {
				window.clearTimeout(logoFloatDelay);
			}
			if (logoGlowDelay !== undefined) {
				window.clearTimeout(logoGlowDelay);
			}
			logoFloat?.revert();
			logoGlow?.revert();
			timeline.pause();
			timeline.revert();
		};
	}, []);

	return (
		<div
			ref={rootRef}
			className="rox-anime rox-intro"
			data-intro-fallback="pending"
		>
			<div className="rox-intro__logo">
				<Image
					src="/rox-logo-light.png"
					alt="Rox"
					width={140}
					height={213}
					priority
				/>
			</div>

			<div className="rox-intro__stage">
				<div className="rox-intro__slide rox-intro__slide--one">
					{SLIDE_ONE_ROWS.map((row) => (
						<div key={row.id} className="rox-intro__row">
							{row.cells.map((cell) =>
								cell.isCenter ? (
									<p key={cell.id} className="rox-intro__center">
										{cell.word}
									</p>
								) : (
									<p key={cell.id} className="rox-intro__flank">
										{cell.word}
									</p>
								),
							)}
						</div>
					))}
				</div>
			</div>

			<a
				className="rox-intro__skip"
				href="/?intro=skip"
				onClick={() => onCompleteRef.current()}
			>
				Пропустить
			</a>
		</div>
	);
}
