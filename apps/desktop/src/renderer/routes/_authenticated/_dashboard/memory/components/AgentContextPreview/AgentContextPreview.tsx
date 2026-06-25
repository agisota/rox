import type { SelectMemoryItem } from "@rox/db/schema";
import {
	annotateMemoryContextItems,
	MEMORY_CONTEXT_CATEGORY_HEADERS,
	MEMORY_CONTEXT_MAX_CHARS,
	MEMORY_CONTEXT_MAX_ITEMS,
	type MemoryContextCategory,
} from "@rox/shared/memory-context";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@rox/ui/collapsible";
import { cn } from "@rox/ui/utils";
import { useMemo, useState } from "react";
import { HiChevronRight } from "react-icons/hi2";

interface AgentContextPreviewProps {
	/** The user's approved memory items (the same set the injector reads). */
	approved: readonly SelectMemoryItem[];
}

/**
 * "Что увидит агент" — a read-only, collapsible preview of exactly what
 * `buildMemoryContextBlock` injects into a chat run. It reuses the shared
 * {@link annotateMemoryContextItems} selector, so the order and the
 * count/character budget match the injected block precisely (acceptance:
 * "совпадает по порядку/бюджету"). Items that fall outside the budget are shown
 * greyed out with a "не попадёт в контекст" note, making the cut-off visible
 * rather than silent.
 *
 * Pure client-side derivation over resident data — no server call, ports to
 * web/mobile unchanged.
 */
export function AgentContextPreview({ approved }: AgentContextPreviewProps) {
	const [open, setOpen] = useState(false);

	const annotated = useMemo(
		() =>
			annotateMemoryContextItems(
				approved.map((item) => ({
					category: item.category as MemoryContextCategory,
					body: item.body,
					updatedAt: item.updatedAt,
				})),
			),
		[approved],
	);

	const includedCount = useMemo(
		() => annotated.filter((entry) => entry.included).length,
		[annotated],
	);

	if (annotated.length === 0) return null;

	const overflowCount = annotated.length - includedCount;

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="rounded-lg border border-border"
		>
			<CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
				<div className="min-w-0">
					<span className="font-medium text-foreground text-sm">
						Что увидит агент
					</span>
					<p className="text-muted-foreground text-xs">
						Предпросмотр контекста памяти, который инжектится в чат (
						{includedCount} из {annotated.length})
					</p>
				</div>
				<HiChevronRight
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-90",
					)}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent className="px-4 pb-3">
				<p className="mb-2 text-[10px] text-muted-foreground/70">
					Порядок и бюджет совпадают с инъекцией: сначала «Предпочтения и
					правила» и «Личное», затем самые свежие. Лимит —{" "}
					{MEMORY_CONTEXT_MAX_ITEMS} записей / {MEMORY_CONTEXT_MAX_CHARS}{" "}
					символов.
				</p>
				<ol className="space-y-1">
					{annotated.map((entry, index) => (
						<li
							key={`${index}-${entry.body}`}
							className={cn(
								"flex items-start gap-2 rounded-md px-2 py-1 text-xs leading-snug",
								entry.included
									? "bg-muted/40 text-foreground"
									: "text-muted-foreground/50",
							)}
						>
							<span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] text-muted-foreground">
								{
									MEMORY_CONTEXT_CATEGORY_HEADERS[
										entry.item.category as MemoryContextCategory
									]
								}
							</span>
							<span className="min-w-0 flex-1 select-text">{entry.body}</span>
							{!entry.included && (
								<span className="shrink-0 text-[9px] italic">
									не попадёт в контекст
								</span>
							)}
						</li>
					))}
				</ol>
				{overflowCount > 0 && (
					<p className="mt-2 text-[10px] text-muted-foreground/60">
						{overflowCount} записей сверх бюджета — агент их не увидит, пока вы
						не удалите/сократите другие.
					</p>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}
