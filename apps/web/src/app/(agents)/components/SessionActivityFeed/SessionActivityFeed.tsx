"use client";

import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type {
	SessionActivityItem,
	SessionActivityKind,
} from "../../agents/session-dashboard";

const ACTIVITY_FILTERS: {
	value: "all" | SessionActivityKind;
	label: string;
}[] = [
	{ value: "all", label: "Все" },
	{ value: "tool", label: "Tool" },
	{ value: "result", label: "Result" },
	{ value: "complete", label: "Complete" },
	{ value: "request", label: "LLM" },
];

const KIND_LABELS: Record<SessionActivityKind, string> = {
	tool: "TOOL",
	result: "RESULT",
	complete: "COMPLETE",
	request: "LLM",
};

const KIND_BADGE_CLASS_NAMES: Record<SessionActivityKind, string> = {
	tool: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	result:
		"border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
	complete: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	request:
		"border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export function SessionActivityFeed({
	items,
}: {
	items: SessionActivityItem[];
}) {
	const [query, setQuery] = useState("");
	const [kind, setKind] = useState<"all" | SessionActivityKind>("all");
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

	const filteredItems = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return items.filter((item) => {
			if (kind !== "all" && item.kind !== kind) {
				return false;
			}
			if (!normalizedQuery) {
				return true;
			}

			return [item.title, item.detail, item.toolName]
				.filter((value): value is string => Boolean(value))
				.some((value) => value.toLowerCase().includes(normalizedQuery));
		});
	}, [items, kind, query]);

	const allVisibleIds = filteredItems.map((item) => item.id);

	return (
		<section className="rounded-lg border bg-card">
			<div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
						Activity
					</p>
					<h2 className="text-base font-semibold">Лента действий</h2>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<select
						value={kind}
						onChange={(event) =>
							setKind(event.currentTarget.value as "all" | SessionActivityKind)
						}
						className="h-9 rounded-md border bg-background px-3 text-sm"
						aria-label="Фильтр по типу действия"
					>
						{ACTIVITY_FILTERS.map((filter) => (
							<option key={filter.value} value={filter.value}>
								{filter.label}
							</option>
						))}
					</select>
					<div className="relative min-w-0 sm:w-72">
						<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.currentTarget.value)}
							placeholder="Поиск по activity"
							className="pl-9"
						/>
					</div>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setExpandedIds(new Set(allVisibleIds))}
						>
							Развернуть
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setExpandedIds(new Set())}
						>
							Свернуть
						</Button>
					</div>
				</div>
			</div>
			<div className="divide-y">
				{filteredItems.length === 0 ? (
					<p className="p-6 text-sm text-muted-foreground">
						Нет событий под текущий фильтр.
					</p>
				) : (
					filteredItems.map((item) => {
						const expanded = expandedIds.has(item.id);
						return (
							<button
								key={item.id}
								type="button"
								className="grid w-full grid-cols-[1.5rem_5rem_auto] gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50"
								onClick={() =>
									setExpandedIds((current) => {
										const next = new Set(current);
										if (next.has(item.id)) {
											next.delete(item.id);
										} else {
											next.add(item.id);
										}
										return next;
									})
								}
							>
								<span className="pt-0.5 text-muted-foreground">
									{expanded ? (
										<ChevronDown className="size-4" />
									) : (
										<ChevronRight className="size-4" />
									)}
								</span>
								<span className="font-mono text-xs text-muted-foreground">
									+{formatOffset(item.offsetMs)}
								</span>
								<span className="min-w-0">
									<span className="flex flex-wrap items-center gap-2">
										<Badge
											variant="outline"
											className={KIND_BADGE_CLASS_NAMES[item.kind]}
										>
											{KIND_LABELS[item.kind]}
										</Badge>
										<span className="truncate font-medium">{item.title}</span>
										{item.tokensIn + item.tokensOut > 0 && (
											<span className="ml-auto font-mono text-xs text-muted-foreground">
												{formatNumber(item.tokensIn)} in /{" "}
												{formatNumber(item.tokensOut)} out
											</span>
										)}
									</span>
									{expanded && (
										<span className="mt-2 block whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
											{item.detail || "Детали события не записаны."}
										</span>
									)}
								</span>
							</button>
						);
					})
				)}
			</div>
		</section>
	);
}

function formatOffset(offsetMs: number) {
	const seconds = offsetMs / 1000;
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const rest = Math.round(seconds % 60);
	return `${minutes}m ${rest}s`;
}

function formatNumber(value: number) {
	return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
		value,
	);
}
