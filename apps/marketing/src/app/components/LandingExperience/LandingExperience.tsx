"use client";

import { COMPANY, DOWNLOAD_URL_MAC_ARM64 } from "@rox/shared/constants";
import { useCallback, useState } from "react";
import { DownloadSnapX } from "./components/DownloadSnapX";
import { GitHubStarButton } from "./components/GitHubStarButton";
import { IntroOverlay } from "./components/IntroOverlay";
import { ScrambleLanding } from "./components/ScrambleLanding";
import type { LandingPhase } from "./constants";
import { THANKS_HEADING, THANKS_HINT } from "./constants";
import "./landing-experience.css";

interface LandingExperienceProps {
	/** Live community star count for the Rox repo, fetched on the server. */
	starCount: number;
}

/**
 * Orchestrates the anime.js landing flow as a phase state machine:
 *   intro  → fullscreen "Представляем Rox One" scramble timeline
 *   main   → scramble-text landing document with the slide-to-download CTA
 *   downloading → CTA swaps to the thank-you block + GitHub star counter
 *
 * The intro plays on every entry (no persistence by request).
 */
export function LandingExperience({ starCount }: LandingExperienceProps) {
	const [phase, setPhase] = useState<LandingPhase>("intro");

	const handleIntroComplete = useCallback(() => {
		setPhase((current) => (current === "intro" ? "main" : current));
	}, []);

	const handleDownloadStart = useCallback(() => {
		setPhase("downloading");
	}, []);

	if (phase === "intro") {
		return <IntroOverlay onComplete={handleIntroComplete} />;
	}

	return (
		<ScrambleLanding>
			{phase === "downloading" ? (
				<div className="rox-thanks">
					<p className="rox-thanks__heading">{THANKS_HEADING}</p>
					<p className="rox-thanks__hint">
						{THANKS_HINT}{" "}
						<a
							href={DOWNLOAD_URL_MAC_ARM64}
							className="underline underline-offset-2"
						>
							Скачать ещё раз
						</a>
					</p>
					<GitHubStarButton targetCount={starCount} />
				</div>
			) : (
				<>
					<DownloadSnapX onDownloadStart={handleDownloadStart} />
					<a
						href={COMPANY.GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="rox-landing__secondary"
					>
						Открыть на GitHub →
					</a>
				</>
			)}
		</ScrambleLanding>
	);
}
