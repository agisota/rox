import { COMPANY } from "@rox/shared/constants";
import type { Metadata } from "next";
import { GridCross } from "@/app/blog/components/GridCross";
import { GlossaryText } from "@/components/GlossaryTerm";
import { RoadmapBoard } from "./components/RoadmapBoard";

export const metadata: Metadata = {
	title: "Дорожная карта",
	description:
		"Посмотри, что мы создаем сейчас, что появится дальше и куда движется Rox.",
	alternates: {
		canonical: "/roadmap",
	},
	openGraph: {
		title: "Дорожная карта | Rox",
		description:
			"Посмотри, что мы создаем сейчас, что появится дальше и куда движется Rox.",
		url: "/roadmap",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Дорожная карта | Rox",
		description:
			"Посмотри, что мы создаем сейчас, что появится дальше и куда движется Rox.",
		images: ["/opengraph-image"],
	},
};

export default function RoadmapPage() {
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
						Дорожная карта
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						Что мы создаем
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						<GlossaryText
							text={`Что уже в работе, что появится дальше и куда движется ${COMPANY.NAME}. Приоритеты могут меняться по мере того, как мы узнаем больше.`}
						/>
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Content */}
			<div className="relative max-w-5xl mx-auto px-6 py-12 md:py-16">
				<RoadmapBoard />
			</div>
		</main>
	);
}
