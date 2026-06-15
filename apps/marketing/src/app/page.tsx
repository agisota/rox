import { COMPANY } from "@rox/shared/constants";
import type { Metadata } from "next";
import { LandingExperience } from "./components/LandingExperience";
import { STAR_COUNT_FALLBACK } from "./components/LandingExperience/constants";

export const metadata: Metadata = {
	alternates: {
		canonical: COMPANY.MARKETING_URL,
	},
};

/**
 * Live community star count for the Rox repo, used to animate the post-download
 * GitHub star counter. Revalidated hourly; falls back to a constant on failure.
 */
async function getStarCount(): Promise<number> {
	try {
		const match = COMPANY.GITHUB_URL.match(/github\.com\/([^/]+\/[^/]+)/);
		if (!match) {
			return STAR_COUNT_FALLBACK;
		}
		const response = await fetch(`https://api.github.com/repos/${match[1]}`, {
			headers: { Accept: "application/vnd.github.v3+json" },
			next: { revalidate: 3600 },
		});
		if (!response.ok) {
			return STAR_COUNT_FALLBACK;
		}
		const data = (await response.json()) as { stargazers_count?: number };
		return data.stargazers_count ?? STAR_COUNT_FALLBACK;
	} catch {
		return STAR_COUNT_FALLBACK;
	}
}

export default async function Home() {
	const starCount = await getStarCount();

	return <LandingExperience starCount={starCount} />;
}
