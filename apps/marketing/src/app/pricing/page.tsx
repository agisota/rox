import { COMPANY } from "@rox/shared/constants";
import type { Metadata } from "next";
import { ComparisonTable } from "./components/ComparisonTable";
import { PricingFAQ } from "./components/PricingFAQ";
import { PricingHero } from "./components/PricingHero";
import { PricingTiers } from "./components/PricingTiers";

export const metadata: Metadata = {
	title: "Цены",
	description: `Простые цены для любой команды. Бесплатно для индивидуальной работы, 15 $ за пользователя в месяц для команд и индивидуальные условия для корпоративных клиентов. Запускай 10+ параллельных кодинг-агентов с ${COMPANY.NAME}.`,
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/pricing`,
	},
};

export default function PricingPage() {
	return (
		<main className="relative min-h-screen">
			<PricingHero />

			<section className="relative border-b border-border">
				<div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
					<PricingTiers />
				</div>
			</section>

			<section className="relative border-b border-border">
				<div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
					<ComparisonTable />
				</div>
			</section>

			<section className="relative">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<PricingFAQ />
				</div>
			</section>
		</main>
	);
}
