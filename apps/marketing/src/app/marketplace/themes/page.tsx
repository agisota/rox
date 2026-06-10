import { COMPANY } from "@rox/shared/constants";
import { Button } from "@rox/ui/button";
import { ThemePreviewCard } from "@rox/ui/theme-preview-card";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { themeListings } from "@/lib/marketplace";

export const metadata: Metadata = {
	title: "Темы",
	description:
		"Просматривайте темы Rox от сообщества, включая GitHub Dark Colorblind, Catppuccin, Ember и One Dark Pro.",
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/marketplace/themes`,
	},
};

export default function MarketplaceThemesPage() {
	return (
		<main className="min-h-screen">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<h1 className="mb-6 text-xl font-semibold text-foreground md:text-2xl">
					Темы
				</h1>

				<div className="grid gap-4 md:grid-cols-2">
					{themeListings.map((theme) => (
						<ThemePreviewCard
							key={theme.slug}
							name={theme.name}
							backgroundColor={theme.terminal.background}
							foregroundColor={theme.terminal.foreground}
							promptColor={theme.terminal.green}
							infoColor={theme.terminal.cyan}
							readyColor={theme.terminal.yellow}
							palette={[
								theme.terminal.red,
								theme.terminal.green,
								theme.terminal.yellow,
								theme.terminal.blue,
								theme.terminal.magenta,
								theme.terminal.cyan,
							]}
							className="rounded-none border-border"
							paletteItemClassName="rounded-none"
							footerRight={
								<Button
									asChild
									variant="outline"
									size="icon-sm"
									className="rounded-none"
								>
									<a
										href={theme.source.href}
										download
										aria-label={`Скачать ${theme.name}`}
										title={`Скачать ${theme.name}`}
									>
										<Download className="size-4" aria-hidden="true" />
									</a>
								</Button>
							}
						/>
					))}
				</div>
			</div>
		</main>
	);
}
