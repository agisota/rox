import { COMPANY } from "@rox/shared/constants";
import type { Metadata } from "next";
import { LandingExperience } from "./components/LandingExperience";

export const metadata: Metadata = {
	alternates: {
		canonical: COMPANY.MARKETING_URL,
	},
};

interface HomeProps {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: HomeProps) {
	const params = await searchParams;
	const introParam = params?.intro;
	const skipIntro = Array.isArray(introParam)
		? introParam.includes("skip")
		: introParam === "skip";

	return <LandingExperience initialPhase={skipIntro ? "main" : "intro"} />;
}
