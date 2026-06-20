"use client";

import { animate, createTimeline, scrambleText, stagger } from "animejs";
import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	INTRO_BRAND,
	INTRO_FEATURE_TAGS,
	INTRO_LANGS,
	INTRO_LEAD_WORD,
} from "../../constants";
import { CpuArchitecture } from "../CpuArchitecture";
import {
	type FeatureCloudPlacement,
	layoutFeatureCloud,
} from "./featureCloudLayout";

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

const INTRO_FEATURES = INTRO_FEATURE_TAGS.map((tag, index) => ({
	...tag,
	id: `intro-feature-${index}`,
	index,
}));

type FeatureCloudStyle = CSSProperties &
	Record<
		"--rox-tag-x" | "--rox-tag-y" | "--rox-tag-rot" | "--rox-tag-scale",
		string
	>;

function placementToStyle(
	placement: FeatureCloudPlacement,
	color: number,
): FeatureCloudStyle {
	return {
		"--rox-tag-x": `${placement.xPct.toFixed(2)}%`,
		"--rox-tag-y": `${placement.yPct.toFixed(2)}%`,
		"--rox-tag-rot": `${placement.rotationDeg.toFixed(2)}deg`,
		"--rox-tag-scale": placement.scale.toFixed(3),
		color: `var(--rox-c-${color})`,
	};
}

/**
 * Pick a responsive footprint + tag cap for the feature cloud from the live
 * container width. Narrow screens get a smaller font, more breathing room and a
 * lower cap so the scatter stays readable instead of cramming every tag in.
 */
function getCloudSizing(width: number): {
	fontPx: number;
	gapPx: number;
	maxTags: number;
} {
	if (width < 480) return { fontPx: 11, gapPx: 12, maxTags: 16 };
	if (width < 760) return { fontPx: 12, gapPx: 14, maxTags: 24 };
	if (width < 1100) return { fontPx: 13, gapPx: 16, maxTags: 34 };
	return { fontPx: 14, gapPx: 18, maxTags: INTRO_FEATURE_TAGS.length };
}

/** Scramble cursor glyphs reused from the original anime.js demo. */
const CURSOR_HEAVY = "░▒▓█";
const CURSOR_LIGHT = "░▒▓";

/** Hard ceiling so onComplete always fires even if the timeline stalls. */
const SAFETY_TIMEOUT_MS = 18_000;
const MIN_INTRO_DURATION_MS = 7_600;

/** Delay the independent logo float until the one-shot reveal tween has landed. */
const LOGO_FLOAT_DELAY_MS = 2_200;

/**
 * Fullscreen one-shot intro that fills the screen with «Introducing» in many
 * languages, collapses it into the ROX wordmark (with the logo revealed beside
 * it), fans out the feature tags across the viewport width, then hands off to
 * the hero. Ports Julian Garnier's "Scramble Text timeline" CodePen onto the
 * Rox palette.
 */
export function IntroOverlay({ onComplete }: IntroOverlayProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const cloudRef = useRef<HTMLDivElement>(null);
	const onCompleteRef = useRef(onComplete);
	onCompleteRef.current = onComplete;

	// Live container box for the feature cloud. Seed from the viewport so a
	// collision-free layout exists on the very first render (the anime.js
	// timeline queries `.rox-intro__feature` at mount).
	const [cloudBox, setCloudBox] = useState(() => {
		if (typeof window === "undefined") return { width: 1200, height: 620 };
		const insetX = Math.min(176, window.innerWidth * 0.1);
		const insetY = Math.min(176, window.innerHeight * 0.16);
		return {
			width: Math.max(280, window.innerWidth - insetX),
			height: Math.max(320, window.innerHeight - insetY),
		};
	});

	// Recompute the box on resize so the scatter stays inside the viewport.
	useEffect(() => {
		const measure = () => {
			const node = cloudRef.current;
			if (node) {
				const rect = node.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) {
					setCloudBox({ width: rect.width, height: rect.height });
					return;
				}
			}
			const insetX = Math.min(176, window.innerWidth * 0.1);
			const insetY = Math.min(176, window.innerHeight * 0.16);
			setCloudBox({
				width: Math.max(280, window.innerWidth - insetX),
				height: Math.max(320, window.innerHeight - insetY),
			});
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);

	// Collision-free placements for the feature tags, capped by viewport size.
	const placedFeatures = useMemo(() => {
		const { fontPx, gapPx, maxTags } = getCloudSizing(cloudBox.width);
		const placements = layoutFeatureCloud(INTRO_FEATURES, {
			width: cloudBox.width,
			height: cloudBox.height,
			fontPx,
			gapPx,
			maxTags,
		});
		return placements
			.map((placement) => {
				const tag = INTRO_FEATURES[placement.index];
				if (!tag) return null;
				return { tag, placement };
			})
			.filter(
				(
					entry,
				): entry is {
					tag: (typeof INTRO_FEATURES)[number];
					placement: FeatureCloudPlacement;
				} => entry !== null,
			);
	}, [cloudBox.width, cloudBox.height]);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) {
			return;
		}
		root.setAttribute("data-intro-js", "enhanced");

		const introStartedAt = window.performance.now();
		let finished = false;
		let fallbackStarted = false;
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
			root.style.pointerEvents = "none";
			root.style.visibility = "hidden";
			onCompleteRef.current();
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
		const cpuMark = select<HTMLElement>(".rox-intro__cpu");
		const slide2 = select<HTMLElement>(".rox-intro__slide--two");
		const slide2Words = select<HTMLElement>(
			".rox-intro__slide--two .rox-intro__feature",
		);

		const timeline = createTimeline({
			loop: false,
			onComplete: finishOnce,
		});
		// When the tag cloud (beat 4) is revealed, the girl logo + CPU chip
		// (beat 3) MUST be gone so the two beats never overlap on screen.
		const hideLogoAndCpu = () => {
			if (logo[0]) logo[0].style.opacity = "0";
			if (cpuMark[0]) cpuMark[0].style.opacity = "0";
		};
		const showTagCloud = () => {
			hideLogoAndCpu();
			if (slide1[0]) slide1[0].style.opacity = "0";
			if (slide2[0]) slide2[0].style.opacity = "1";
		};
		const startTimelineFallback = (showTagsImmediately = false) => {
			if (finished || fallbackStarted) {
				return;
			}
			fallbackStarted = true;
			timeline.pause();
			root.style.backgroundColor = "#000";
			if (slide1[0]) slide1[0].style.opacity = "1";
			if (slide2[0]) slide2[0].style.opacity = "0";

			if (showTagsImmediately) {
				showTagCloud();
				queueFallbackTimer(finishOnce, 4000);
				return;
			}

			queueFallbackTimer(() => {
				if (finished) return;
				showTagCloud();
			}, 2200);
			queueFallbackTimer(finishOnce, 6200);
		};

		// ── Slide 1: multilingual word grid collapses into the ROX wordmark ──
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
			.add(
				cpuMark,
				{
					opacity: { to: 1 },
					ease: "out(2)",
					duration: 900,
				},
				"<+=200",
			)
			.add(cpuMark, { opacity: 1, duration: 900 }, "<+=200");

		// ── Slide 2: feature tags scattered across the viewport width ───────
		// The logo + CPU mark ("screen 2") must FULLY fade out before the
		// feature cloud ("screen 3") is revealed — otherwise the two screens
		// overlap and visually collapse into one. Hold the logo a beat longer,
		// fade it over LOGO_FADE_MS, then swap slides and scramble in the
		// features only once the fade has landed.
		const LOGO_FADE_MS = 450;
		timeline
			.add(root, { backgroundColor: "#000" }, "<+=600")
			.add(
				logo,
				{ opacity: { to: 0 }, ease: "out(2)", duration: LOGO_FADE_MS },
				"<<",
			)
			.add(
				cpuMark,
				{ opacity: { to: 0 }, ease: "out(2)", duration: LOGO_FADE_MS },
				"<<",
			)
			// Swap slides only once the logo/CPU fade has completed.
			.set(slide1, { opacity: 0 }, `<+=${LOGO_FADE_MS}`)
			.set(slide2, { opacity: 1 }, "<<")
			.set(
				slide2Words,
				{
					opacity: 0,
					scale: 0.82,
					translateY: 12,
				},
				"<<",
			)
			.add(
				slide2Words,
				{
					opacity: { to: 1, duration: 520, ease: "out(2)" },
					scale: { to: 1, duration: 720, ease: "out(3)" },
					translateY: { to: 0, duration: 720, ease: "out(3)" },
				},
				stagger([40, 1800], {
					from: "random",
					ease: "out(3)",
					start: "<<+=120",
				}),
			)
			.add(
				slide2Words,
				{
					innerHTML: scrambleText({
						override: false,
						from: "random",
						duration: 700,
						settleDuration: 400,
						cursor: CURSOR_LIGHT,
						perturbation: 0.4,
					}),
				},
				stagger([30, 1200], { from: "random", start: "<+=1600" }),
			)
			.add(root, { opacity: 1, duration: 1800 }, "<+=1200");

		timeline.init();
		timeline.restart();
		timeline.play();

		queueFallbackTimer(completeNow, MIN_INTRO_DURATION_MS);
		queueFallbackTimer(() => {
			const slideOneOpacity = Number.parseFloat(
				slide1[0] ? getComputedStyle(slide1[0]).opacity : "0",
			);
			if (slideOneOpacity < 0.05) {
				startTimelineFallback();
			}
		}, 900);
		queueFallbackTimer(() => {
			const slideTwoOpacity = Number.parseFloat(
				slide2[0] ? getComputedStyle(slide2[0]).opacity : "0",
			);
			if (slideTwoOpacity < 0.05) {
				startTimelineFallback(true);
			}
		}, 4200);

		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		let logoFloat: { revert: () => void } | null = null;
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

		const safety = window.setTimeout(finishOnce, SAFETY_TIMEOUT_MS);

		return () => {
			window.clearTimeout(safety);
			for (const timer of fallbackTimers) {
				window.clearTimeout(timer);
			}
			if (logoFloatDelay !== undefined) {
				window.clearTimeout(logoFloatDelay);
			}
			logoFloat?.revert();
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

			<div className="rox-intro__cpu" aria-hidden="true">
				<CpuArchitecture text={INTRO_BRAND} />
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

				<div className="rox-intro__slide rox-intro__slide--two rox-intro__features">
					<div ref={cloudRef} className="rox-intro__features-cloud">
						{placedFeatures.map(({ tag, placement }) => (
							<p
								key={tag.id}
								className="rox-intro__feature"
								style={placementToStyle(placement, tag.color)}
							>
								{tag.text}
							</p>
						))}
					</div>
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
