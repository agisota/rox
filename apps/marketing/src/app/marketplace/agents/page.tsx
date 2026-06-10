import { COMPANY } from "@rox/shared/constants";
import { Button } from "@rox/ui/button";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { marketplaceSubmissionLinks } from "@/lib/marketplace";

export const metadata: Metadata = {
	title: "Конфиги агентов",
	description:
		"Будущий раздел для переиспользуемых конфигов агентов Rox, prompts и инструкций по настройке.",
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/marketplace/agents`,
	},
};

export default function MarketplaceAgentsPage() {
	return (
		<main className="min-h-screen">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<div className="mb-8">
					<h1 className="text-xl font-semibold text-foreground md:text-2xl">
						Конфиги агентов
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Публичных конфигов агентов пока нет. Этот route готов для будущих
						публикаций конфигов.
					</p>
				</div>

				<div className="border border-border">
					<div className="border-b border-border px-4 py-3">
						<p className="text-sm text-muted-foreground">
							Добавьте сюда конфиги агентов, когда будете готовы их
							опубликовать.
						</p>
					</div>
					<div className="px-4 py-4">
						<Button asChild size="sm" className="rounded-none">
							<a
								href={marketplaceSubmissionLinks.agent}
								target="_blank"
								rel="noopener noreferrer"
							>
								Предложить идею агента
								<ArrowUpRight className="size-4" />
							</a>
						</Button>
					</div>
				</div>
			</div>
		</main>
	);
}
