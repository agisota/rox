"use client";

import { useCallback, useEffect, useState } from "react";
import { IntroOverlay } from "./components/IntroOverlay";
import { ScrambleLanding } from "./components/ScrambleLanding";
import type { LandingPhase } from "./constants";
import "./landing-experience.css";

const INTRO_HANDOFF_MS = 10_800;

/**
 * Orchestrates the anime.js landing flow as a phase state machine:
 *   intro → fullscreen "Представляем Rox One" scramble timeline
 *   main  → hero with orchestration field and download CTA
 *
 * The intro plays on every entry (no persistence by request).
 */
interface LandingExperienceProps {
	initialPhase?: LandingPhase;
}

export function LandingExperience({
	initialPhase = "intro",
}: LandingExperienceProps) {
	const [phase, setPhase] = useState<LandingPhase>(initialPhase);

	useEffect(() => {
		if (phase !== "intro") {
			return;
		}
		const timer = window.setTimeout(() => setPhase("main"), INTRO_HANDOFF_MS);
		return () => window.clearTimeout(timer);
	}, [phase]);

	const handleIntroComplete = useCallback(() => {
		setPhase((current) => (current === "intro" ? "main" : current));
	}, []);

	return (
		<>
			<ScrambleLanding />
			{phase === "intro" ? (
				<IntroOverlay onComplete={handleIntroComplete} />
			) : null}
		</>
	);
}
