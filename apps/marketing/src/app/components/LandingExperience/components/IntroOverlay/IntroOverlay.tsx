"use client";

import { createTimeline, scrambleText, stagger } from "animejs";
import { useEffect, useRef } from "react";
import {
	INTRO_BRAND,
	INTRO_FEATURE_TAGS,
	INTRO_LEAD_WORD,
	INTRO_TAGLINE,
} from "../../constants";

interface IntroOverlayProps {
	onComplete: () => void;
}

/** Number of repeated lead words flanking the centered brand word on slide 1. */
const SLIDE_ONE_FLANK = 4;

/** Row distribution for the feature scramble grid on slide 2 (sums to 11). */
const FEATURE_ROW_SIZES = [2, 3, 3, 3] as const;

/**
 * Stable, position-based keys for the repeated lead words on slide 1. The
 * words are identical static repeats, so index-free keys keep React (and
 * Biome's noArrayIndexKey rule) happy without changing render order.
 */
const FLANK_KEYS_PRE = Array.from(
	{ length: SLIDE_ONE_FLANK },
	(_, slot) => `flank-pre-${SLIDE_ONE_FLANK - slot}`,
);
const FLANK_KEYS_POST = Array.from(
	{ length: SLIDE_ONE_FLANK },
	(_, slot) => `flank-post-${slot + 1}`,
);

/** Scramble cursor glyphs reused from the original anime.js demo. */
const CURSOR_HEAVY = "░▒▓█";
const CURSOR_LIGHT = "░▒▓";

/** Hard ceiling so onComplete always fires even if the timeline stalls. */
const SAFETY_TIMEOUT_MS = 13_000;

/** Split the flat feature list into the grid rows rendered on slide 2. */
function chunkFeatures(): ReadonlyArray<
	ReadonlyArray<{ text: string; color: number }>
> {
	const rows: Array<Array<{ text: string; color: number }>> = [];
	let cursor = 0;
	for (const size of FEATURE_ROW_SIZES) {
		rows.push(INTRO_FEATURE_TAGS.slice(cursor, cursor + size).slice());
		cursor += size;
	}
	const rest = INTRO_FEATURE_TAGS.slice(cursor);
	if (rest.length > 0) {
		rows.push(rest.slice());
	}
	return rows;
}

/**
 * Fullscreen one-shot intro that scrambles "Представляем" into the Rox One
 * brand, fans out the feature tags, then resolves to the tagline before
 * signalling completion. Ports Julian Garnier's "Scramble Text timeline"
 * CodePen onto the Rox palette.
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

		// React 18 StrictMode double-mounts effects in dev; guard so the
		// timeline's completion (and the safety timeout) can only fire once.
		let finished = false;
		const finishOnce = () => {
			if (finished) {
				return;
			}
			finished = true;
			onCompleteRef.current();
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
		const slide2 = select<HTMLElement>(".rox-intro__slide--two");
		const slide2Words = select<HTMLElement>(
			".rox-intro__slide--two .rox-intro__feature",
		);
		const slide3 = select<HTMLElement>(".rox-intro__slide--three");
		const slide3Center = select<HTMLElement>(
			".rox-intro__slide--three .rox-intro__center",
		);

		const timeline = createTimeline({
			loop: false,
			onComplete: finishOnce,
		});

		// ── Slide 1: lead-word grid resolves to the Rox One brand ──────────
		timeline
			.add(slide1, {
				opacity: { to: 1, duration: 250, ease: "linear" },
				scale: [{ from: 0.75, to: 1, duration: 1500, ease: "inOut(3.5)" }],
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
			.add(root, { backgroundColor: "var(--rox-bg)" }, "<<+=50")
			.add(
				slide1Flank,
				{
					scale: { from: 0.75 },
					color: { to: "var(--rox-orange-2)" },
					innerHTML: scrambleText({
						override: " ",
						from: "center",
						duration: 500,
						revealDelay: 250,
						cursor: CURSOR_LIGHT,
						perturbation: 0.25,
					}),
				},
				stagger([250, 750], {
					grid: [SLIDE_ONE_FLANK, 1],
					from: "center",
					ease: "out(3)",
					start: "<<",
				}),
			)
			.add(
				slide1Flank,
				{
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
				"<+=150",
			)
			.add(
				slide1Center,
				{
					scale: 1.5,
					color: { to: "var(--rox-c-2)" },
					ease: "inOutExpo",
					duration: 1500,
					innerHTML: scrambleText({
						text: INTRO_BRAND,
						ease: "inQuad",
						override: false,
						from: "center",
						duration: 1000,
						perturbation: 0.25,
					}),
				},
				"<<",
			)
			.add(
				slide1Center,
				{
					scale: 1,
					color: "var(--rox-fg-1)",
					ease: "inOutExpo",
					duration: 1150,
					innerHTML: scrambleText({
						override: false,
						text: INTRO_BRAND,
						from: "right",
						duration: 950,
						settleDuration: 500,
						ease: "inOut",
					}),
				},
				"<+=250",
			);

		// ── Slide 2: feature tags scramble in across the grid ──────────────
		timeline
			.add(root, { backgroundColor: "var(--rox-orange-5)" }, "<+=250")
			.set(slide1, { opacity: 0 }, "<<")
			.set(slide2, { opacity: 1 }, "<<")
			.add(
				slide2Words,
				{
					innerHTML: scrambleText({
						override: " ",
						from: "center",
						duration: 500,
						revealDelay: 250,
						cursor: CURSOR_LIGHT,
						perturbation: 0.5,
					}),
				},
				stagger([0, 1000], {
					grid: [Math.max(...FEATURE_ROW_SIZES), FEATURE_ROW_SIZES.length],
					from: "center",
					ease: "out(3)",
					start: "<<+=250",
					reversed: true,
				}),
			);

		// ── Slide 3: closing tagline ───────────────────────────────────────
		timeline
			.add(root, { backgroundColor: "var(--rox-bg)" }, "<+=750")
			.set(slide2, { opacity: 0 }, "<<")
			.set(slide3, { opacity: 1 }, "<<")
			.add(
				slide3Center,
				{
					color: { to: "var(--rox-orange-1)", duration: 750 },
					ease: "inOutExpo",
					duration: 1250,
					innerHTML: scrambleText({
						text: INTRO_TAGLINE,
						override: false,
						from: "right",
						cursor: CURSOR_LIGHT,
						duration: 750,
						ease: "inOut",
					}),
				},
				"<+=250",
			);

		timeline.init();

		// Belt-and-braces: guarantee completion even if a tween never settles.
		const safety = window.setTimeout(finishOnce, SAFETY_TIMEOUT_MS);

		return () => {
			window.clearTimeout(safety);
			timeline.pause();
			timeline.revert();
		};
	}, []);

	const featureRows = chunkFeatures();

	return (
		<div ref={rootRef} className="rox-anime rox-intro">
			<div className="rox-intro__stage">
				<div className="rox-intro__slide rox-intro__slide--one">
					<div className="rox-intro__row">
						{FLANK_KEYS_PRE.map((flankKey) => (
							<p key={flankKey} className="rox-intro__flank">
								{INTRO_LEAD_WORD}
							</p>
						))}
						<p className="rox-intro__center">{INTRO_LEAD_WORD}</p>
						{FLANK_KEYS_POST.map((flankKey) => (
							<p key={flankKey} className="rox-intro__flank">
								{INTRO_LEAD_WORD}
							</p>
						))}
					</div>
				</div>

				<div className="rox-intro__slide rox-intro__slide--two rox-intro__features">
					{featureRows.map((row) => (
						<div
							key={`feature-row-${row[0]?.text ?? "empty"}`}
							className="rox-intro__row"
						>
							{row.map((tag) => (
								<p
									key={tag.text}
									className="rox-intro__feature"
									style={{ color: `var(--rox-c-${tag.color})` }}
								>
									{tag.text}
								</p>
							))}
						</div>
					))}
				</div>

				<div className="rox-intro__slide rox-intro__slide--three">
					<div className="rox-intro__row">
						<p className="rox-intro__center">{INTRO_TAGLINE}</p>
					</div>
				</div>
			</div>

			<button
				type="button"
				className="rox-intro__skip"
				onClick={() => onCompleteRef.current()}
			>
				Пропустить
			</button>
		</div>
	);
}
