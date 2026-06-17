import { COMPANY } from "@rox/shared/constants";
import type { Metadata } from "next";
import { LegalHub } from "./components/LegalHub";

export const metadata: Metadata = {
	title: "Юридическая информация",
	description:
		"Условия использования, политика конфиденциальности, безопасность и иные юридические документы Rox.",
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/legal`,
	},
};

export default function LegalPage() {
	return (
		<main className="bg-background pt-24 pb-16 min-h-screen">
			<LegalHub />
		</main>
	);
}
