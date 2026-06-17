import type { SelectJournalEntry } from "@rox/db/schema";
import { cn } from "@rox/ui/utils";

const CATEGORY_LABELS: Record<string, string> = {
	projects: "Проекты",
	identity: "Личное",
	instructions: "Правила",
	career: "Карьера",
	general: "Общее",
};

function formatDay(day: string): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	return date.toLocaleDateString("ru-RU", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

interface JournalDayProps {
	entry: SelectJournalEntry;
}

/**
 * One day in the journal timeline. Four AI-generated streams, each with a
 * deliberately distinct typographic treatment so they read as separate voices:
 *   1. reflection — large narrative serif
 *   2. learnings — accented bordered list
 *   3. memory suggestions — cards with a category badge
 *   4. tips — small muted italic notes
 */
export function JournalDay({ entry }: JournalDayProps) {
	const learnings = entry.learnings ?? [];
	const memorySuggestions = entry.memorySuggestions ?? [];
	const tips = entry.tips ?? [];

	return (
		<article className="space-y-5">
			<h2 className="font-mono text-muted-foreground text-xs uppercase tracking-[0.18em]">
				{formatDay(entry.day)}
			</h2>

			{/* Stream 1 — reflection (narrative, largest) */}
			{entry.reflection && (
				<p className="font-serif text-foreground text-lg leading-relaxed">
					{entry.reflection}
				</p>
			)}

			{/* Stream 2 — learnings (accent bordered list) */}
			{learnings.length > 0 && (
				<section className="border-primary/60 border-l-2 pl-4">
					<h3 className="mb-2 font-semibold text-[11px] text-primary uppercase tracking-wider">
						Выводы
					</h3>
					<ul className="space-y-1.5">
						{learnings.map((l, i) => (
							<li
								key={`${entry.id}-l-${i}`}
								className="text-foreground text-sm leading-snug"
							>
								{l.text}
							</li>
						))}
					</ul>
				</section>
			)}

			{/* Stream 3 — memory suggestions (cards + category badge) */}
			{memorySuggestions.length > 0 && (
				<section>
					<h3 className="mb-2 font-semibold text-[11px] text-amber-600 uppercase tracking-wider dark:text-amber-500">
						В память
					</h3>
					<div className="space-y-2">
						{memorySuggestions.map((m, i) => (
							<div
								key={`${entry.id}-m-${i}`}
								className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 p-2.5"
							>
								<span className="mt-0.5 shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-400">
									{CATEGORY_LABELS[m.category] ?? m.category}
								</span>
								<span className="text-foreground text-sm leading-snug">
									{m.body}
								</span>
							</div>
						))}
					</div>
				</section>
			)}

			{/* Stream 4 — tips (small muted italic) */}
			{tips.length > 0 && (
				<section>
					<h3 className="mb-1.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
						Советы
					</h3>
					<ul className="space-y-1">
						{tips.map((t, i) => (
							<li
								key={`${entry.id}-t-${i}`}
								className={cn(
									"text-muted-foreground text-xs italic leading-snug",
									"before:mr-1.5 before:content-['→']",
								)}
							>
								{t.text}
							</li>
						))}
					</ul>
				</section>
			)}
		</article>
	);
}
