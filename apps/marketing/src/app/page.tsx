import { COMPANY } from "@rox/shared/constants";
import type { Metadata } from "next";
import { LandingExperience } from "./components/LandingExperience";

export const metadata: Metadata = {
	alternates: {
		canonical: COMPANY.MARKETING_URL,
	},
};

export default function Home() {
	return <LandingExperience />;
}
