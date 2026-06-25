import type { SelectJournalEntry } from "@rox/db/schema";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { StreamingShimmer } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { LuBrain, LuEllipsisVertical, LuRefreshCw, LuX } from "react-icons/lu";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { reflectionDayAnchorId, reflectionDayLabel } from "../datetime";
import { CATEGORY_LABELS } from "../status";

interface ReflectionDayProps {
	entry: SelectJournalEntry;
}

/**
 * One day of AI reflection. The four typographic streams are preserved verbatim
 * from the legacy JournalDay (they are core brand) — narrative serif,
 * accent-bordered learnings, amber memory-candidate cards, muted-italic tips.
 *
 * Added: a sticky day header with a kebab overflow that re-queues the day's R1
 * generation via `journalRouter.regenerateDay` (QStash → async), surfacing a
 * "queued" toast and a calm StreamingShimmer while the row is `pending`.
 */
export function ReflectionDay({ entry }: ReflectionDayProps) {
	const trpc = useTRPC();
	const learnings = entry.learnings ?? [];
	const memorySuggestions = entry.memorySuggestions ?? [];
	const tips = entry.tips ?? [];

	// Locally hidden / already-promoted candidates. The candidates live inside
	// the read-only `journal_entries.memory_suggestions` JSON (the client never
	// writes that collection), so "Скрыть" and a successful promote both just
	// drop the card from view for this session.
	const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
	const visibleSuggestions = memorySuggestions
		.map((m, i) => ({ m, i }))
		.filter(({ i }) => !hidden.has(i));

	const hideCandidate = (index: number) => {
		setHidden((prev) => {
			const next = new Set(prev);
			next.add(index);
			return next;
		});
	};

	const promote = useMutation(
		trpc.memory.promoteFromJournal.mutationOptions({
			onError: (error: { message?: string }) => {
				toast.error(error.message || "Не удалось добавить в память");
			},
		}),
	);

	const regenerate = useMutation(
		trpc.journal.regenerateDay.mutationOptions({
			onSuccess: () => {
				toast.success("Постановка в очередь…", {
					description: "Rox R1 перегенерирует рефлексию за этот день.",
				});
			},
			onError: (error: { message?: string }) => {
				toast.error(error.message || "Не удалось перегенерировать день");
			},
		}),
	);

	// Pending = server still (re)generating; show the breathing shimmer.
	const isPending = entry.status === "pending" || regenerate.isPending;

	return (
		<article
			id={reflectionDayAnchorId(entry.day)}
			className="scroll-mt-2 space-y-5"
		>
			<header className="glass -mx-1 sticky top-0 z-10 flex items-center justify-between gap-2 px-1 py-1.5">
				<h2 className="font-mono text-muted-foreground text-xs uppercase tracking-[0.18em]">
					{reflectionDayLabel(entry.day)}
				</h2>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground hover:text-foreground"
							aria-label="Действия за день"
						>
							<LuEllipsisVertical className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							disabled={regenerate.isPending}
							onSelect={() => regenerate.mutate({ day: entry.day })}
						>
							<LuRefreshCw className="size-4" />
							Перегенерировать день
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</header>

			<StreamingShimmer active={isPending}>
				<div
					className={cn(
						"space-y-5 transition-opacity",
						isPending && "opacity-70",
					)}
				>
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
					{visibleSuggestions.length > 0 && (
						<section>
							<h3 className="mb-2 font-semibold text-[11px] text-amber-600 uppercase tracking-wider dark:text-amber-500">
								В память
							</h3>
							<div className="space-y-2">
								{visibleSuggestions.map(({ m, i }) => {
									const isPromoting =
										promote.isPending && promote.variables?.body === m.body;
									return (
										<div
											key={`${entry.id}-m-${i}`}
											className="group/candidate flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 p-2.5"
										>
											<span className="mt-0.5 shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-400">
												{CATEGORY_LABELS[m.category] ?? m.category}
											</span>
											<span className="flex-1 select-text text-foreground text-sm leading-snug">
												{m.body}
											</span>
											<div className="flex shrink-0 items-center gap-0.5">
												<Button
													variant="ghost"
													size="icon-xs"
													disabled={isPromoting}
													aria-label="Добавить в память"
													title="Добавить в память"
													className="text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400"
													onClick={() => {
														promote.mutate(
															{
																category: m.category,
																body: m.body,
																day: entry.day,
															},
															{
																onSuccess: () => {
																	toast.success("Добавлено в память", {
																		description:
																			CATEGORY_LABELS[m.category] ?? m.category,
																	});
																	hideCandidate(i);
																},
															},
														);
													}}
												>
													<LuBrain className="size-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label="Скрыть"
													title="Скрыть"
													className="text-muted-foreground hover:text-foreground"
													onClick={() => hideCandidate(i)}
												>
													<LuX className="size-4" />
												</Button>
											</div>
										</div>
									);
								})}
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
				</div>
			</StreamingShimmer>
		</article>
	);
}
