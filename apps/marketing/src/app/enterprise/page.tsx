import { COMPANY } from "@rox/shared/constants";
import type { Metadata } from "next";
import { GridCross } from "@/app/blog/components/GridCross";
import { EnterpriseContactForm } from "./components/EnterpriseContactForm";
import { EnterpriseFAQ } from "./components/EnterpriseFAQ";

export const metadata: Metadata = {
	title: "Enterprise",
	description: `Подключите ${COMPANY.NAME} для своей команды. Свяжитесь с нами, чтобы узнать больше об Enterprise-планах и вариантах развертывания.`,
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/enterprise`,
	},
};

export default function EnterprisePage() {
	return (
		<main className="relative min-h-screen">
			{/* Vertical guide lines */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			{/* Header section */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						Enterprise
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						Rox для вашей команды
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						Хотите внедрить Rox в своей организации? Напишите нам, и мы поможем
						подобрать подходящую конфигурацию для вашей команды.
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Contact form */}
			<div className="relative max-w-3xl mx-auto px-6 py-12 md:py-16">
				<EnterpriseContactForm />
			</div>

			{/* FAQ */}
			<div className="relative border-t border-border">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<EnterpriseFAQ />
				</div>
			</div>
		</main>
	);
}
