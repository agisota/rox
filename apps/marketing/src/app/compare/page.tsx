import type { Metadata } from "next";
import Link from "next/link";
import { GridCross } from "@/app/blog/components/GridCross";
import { GlossaryText } from "@/components/GlossaryTerm";
import { getComparisonPages } from "@/lib/compare";
import { formatCompareDate } from "@/lib/compare-utils";

const COMPARE_CARD_COPY: Record<
	string,
	{
		title: string;
		description: string;
	}
> = {
	"best-ai-coding-agents-2026": {
		title:
			"Лучшие AI-инструменты и агенты для разработки в 2026 году: полное сравнение",
		description:
			"Сравните главные AI-инструменты для разработки в 2026 году: Rox, Cursor, Claude Code, Codex, Windsurf, Devin, Capy, Conductor и другие. Найдите подходящий стек для своего рабочего процесса.",
	},
	"best-terminal-for-ai-coding": {
		title: "Лучший терминал для AI-агентов разработки в 2026 году",
		description:
			"Сравните лучшие терминалы для AI-разработки, включая Rox, Warp, iTerm2, Ghostty, kitty, Alacritty и WezTerm.",
	},
	"multiple-claude-code-agents-parallel": {
		title: "Как запускать несколько агентов Claude Code параллельно",
		description:
			"Разберите самый безопасный способ запускать несколько сессий Claude Code одновременно. Сравните вкладки терминала, tmux, ручные git worktree и оркестрацию Rox.",
	},
	"rox-vs-claude-code": {
		title:
			"Rox против Claude Code (2026): оркестратор агентов и AI-агент разработки",
		description:
			"Сравните Rox и Claude Code для AI-разработки. Rox параллельно оркестрирует множество экземпляров Claude Code в изолированных worktree.",
	},
	"rox-vs-codex": {
		title:
			"Rox против Codex CLI (2026): оркестратор агентов и кодовый агент OpenAI",
		description:
			"Сравните Rox и OpenAI Codex CLI для AI-разработки. Посмотрите, чем параллельная оркестрация агентов отличается от одного облачного агента разработки.",
	},
	"rox-vs-conductor": {
		title:
			"Rox против Conductor (2026): сравнение платформ оркестрации AI-агентов",
		description:
			"Сравните Rox и Conductor для управления AI-агентами разработки. Посмотрите, как эти инструменты оркестрации отличаются по поддержке агентов, рабочему процессу и опыту разработчика.",
	},
	"rox-vs-cursor": {
		title: "Rox против Cursor (2026): параллельные агенты и AI-редактор",
		description:
			"Сравните Rox и Cursor для разработки с AI-помощью. Посмотрите, чем параллельная оркестрация агентов отличается от AI-редактора.",
	},
	"rox-vs-devin": {
		title:
			"Rox против Devin (2026): локальная оркестрация агентов и облачный AI-инженер",
		description:
			"Сравните Rox и Devin для AI-разработки. Посмотрите, чем локальная параллельная оркестрация агентов отличается от полностью удалённого AI software engineer.",
	},
	"rox-vs-github-copilot": {
		title:
			"Rox против GitHub Copilot (2026): оркестрация агентов и AI-напарник",
		description:
			"Сравните Rox и GitHub Copilot для разработки с AI-помощью. Посмотрите, чем параллельная оркестрация агентов отличается от inline AI code completion и чата.",
	},
	"rox-vs-opencode": {
		title:
			"Rox против OpenCode (2026): оркестрация агентов и open-source AI-терминал",
		description:
			"Сравните Rox и OpenCode для разработки с AI-помощью. Посмотрите, чем параллельная оркестрация агентов отличается от одного open-source AI-терминала для разработки.",
	},
	"rox-vs-t3-chat": {
		title:
			"Rox против T3 Chat (2026): оркестрация агентов и multi-model AI-чат",
		description:
			"Сравните Rox и T3 Chat для разработки с AI-помощью. Посмотрите, чем локальная оркестрация кодинг-агентов отличается от hosted multi-model chat app.",
	},
	"rox-vs-warp": {
		title: "Rox против Warp (2026): оркестрация агентов и AI-терминал",
		description:
			"Сравните Rox и Warp для рабочих процессов разработки с AI-помощью. Посмотрите, чем multi-agent orchestration отличается от AI-терминала.",
	},
	"rox-vs-windsurf": {
		title:
			"Rox против Windsurf (2026): параллельная оркестрация агентов и AI IDE",
		description:
			"Сравните Rox и Windsurf для разработки с AI-помощью. Посмотрите, чем параллельная оркестрация агентов отличается от AI IDE.",
	},
};

export const metadata: Metadata = {
	title: "Сравнение Rox | Сравнения и гайды по AI-разработке",
	description:
		"Сравните Rox с Cursor, Claude Code, Codex, Windsurf, Devin, GitHub Copilot и другими инструментами. Изучайте сравнения, подборки и гайды по рабочим процессам.",
	alternates: {
		canonical: "/compare",
	},
	openGraph: {
		title: "Сравнение Rox | Сравнения и гайды по AI-разработке",
		description:
			"Сравните Rox с Cursor, Claude Code, Codex, Windsurf, Devin, GitHub Copilot и другими инструментами. Изучайте сравнения, подборки и гайды по рабочим процессам.",
		url: "/compare",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Сравнение Rox | Сравнения и гайды по AI-разработке",
		description:
			"Сравните Rox с Cursor, Claude Code, Codex, Windsurf, Devin, GitHub Copilot и другими инструментами. Изучайте сравнения, подборки и гайды по рабочим процессам.",
		images: ["/opengraph-image"],
	},
};

export default async function ComparePage() {
	const pages = getComparisonPages();

	const oneVsOne = pages.filter((p) => p.type === "1v1");
	const roundups = pages.filter((p) => p.type === "roundup");
	const tutorials = pages.filter((p) => p.type === "tutorial");

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
						Сравнение
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						Rox и альтернативы
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						<GlossaryText text="Посмотрите, чем Rox отличается от других AI-инструментов для разработки: от AI-редакторов до кодинг-агентов и облачных AI-инженеров." />
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Content */}
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				{roundups.length > 0 && (
					<CompareSection title="Подборки" pages={roundups} />
				)}

				{tutorials.length > 0 && (
					<CompareSection
						title="Гайды по рабочим процессам"
						pages={tutorials}
					/>
				)}

				{oneVsOne.length > 0 && (
					<CompareSection title="Прямые сравнения" pages={oneVsOne} />
				)}

				{pages.length === 0 && (
					<p className="text-muted-foreground">Сравнений пока нет.</p>
				)}
			</div>
		</main>
	);
}

function CompareSection({
	title,
	pages,
}: {
	title: string;
	pages: ReturnType<typeof getComparisonPages>;
}) {
	return (
		<section className="mb-12 last:mb-0">
			<h2 className="text-xl font-medium text-foreground mb-6">{title}</h2>
			<div className="flex flex-col gap-4">
				{pages.map((page) => (
					<CompareCard key={page.slug} page={page} />
				))}
			</div>
		</section>
	);
}

function CompareCard({
	page,
}: {
	page: ReturnType<typeof getComparisonPages>[number];
}) {
	const localizedCopy = COMPARE_CARD_COPY[page.slug] ?? {
		title: page.title,
		description: page.description,
	};

	return (
		<Link
			href={page.url}
			className="group block border border-border rounded-lg p-5 hover:border-foreground/20 transition-colors"
		>
			<h3 className="text-base font-medium text-foreground group-hover:text-foreground/80 transition-colors">
				{localizedCopy.title}
			</h3>
			{localizedCopy.description && (
				<p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
					<GlossaryText text={localizedCopy.description} />
				</p>
			)}
			<span className="text-xs text-muted-foreground mt-3 block">
				Обновлено {formatLocalizedCompareDate(page.lastUpdated || page.date)}
			</span>
		</Link>
	);
}

function formatLocalizedCompareDate(date: string) {
	const parsedDate = new Date(date);

	if (Number.isNaN(parsedDate.getTime())) {
		return formatCompareDate(date);
	}

	return parsedDate.toLocaleDateString("ru-RU", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}
