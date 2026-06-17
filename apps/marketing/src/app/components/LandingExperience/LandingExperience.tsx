"use client";

import { useCallback, useState } from "react";
import { IntroOverlay } from "./components/IntroOverlay";
import { ScrambleLanding } from "./components/ScrambleLanding";
import type { LandingPhase } from "./constants";
import "./landing-experience.css";

/**
 * Orchestrates the anime.js landing flow as a phase state machine:
 *   intro → fullscreen "Представляем Rox One" scramble timeline
 *   main  → hero with orchestration field and download CTA
 *
 * The intro plays on every entry (no persistence by request).
 */
export function LandingExperience() {
	const [phase, setPhase] = useState<LandingPhase>("intro");

	const handleIntroComplete = useCallback(() => {
		setPhase((current) => (current === "intro" ? "main" : current));
	}, []);

	if (phase === "intro") {
		return <IntroOverlay onComplete={handleIntroComplete} />;
	}

	return <ScrambleLanding />;
}
