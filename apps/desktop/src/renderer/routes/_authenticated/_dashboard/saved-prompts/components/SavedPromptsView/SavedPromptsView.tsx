import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Kbd } from "@rox/ui/kbd";
import { ease, motionDuration } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { LuLayoutList, LuPlus, LuRows3, LuSearch } from "react-icons/lu";
import { DashboardSurface } from "renderer/components/DashboardSurface";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { createPromptSearch } from "../../lib/prompt-search";
import { type PromptEntry, RAIL_ALL, type RailFilter } from "../../lib/types";
import { useInsertPrompt } from "../../lib/use-insert-prompt";
import { useSavedPrompts } from "../../lib/use-saved-prompts";
import { useVariableCache } from "../../lib/use-variable-cache";
import { hasVariables, renderPrompt } from "../../lib/variables";
import type { DefaultPrompt } from "./default-prompts";
import { EmptySeedGallery } from "./EmptySeedGallery";
import { LeftRail } from "./LeftRail";
import { PromptCard } from "./PromptCard";
import {
	type EditorState,
	PromptEditorDialog,
	type PromptEditorSubmit,
} from "./PromptEditorDialog";
import { QuickPicker } from "./QuickPicker";
import { SkeletonCards } from "./SkeletonCards";
import { TagFilterRow } from "./TagFilterRow";
import {
	VariableFillDrawer,
	type VariableFillTarget,
} from "./VariableFillDrawer";

type Density = "comfortable" | "compact";

/** "Recently used within the last N days" window for the «Недавние» rail. */
const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 14;

/**
 * Opacity-only entrance for virtualized rows. The virtualizer owns each row's
 * vertical placement via an inline `translateY`, so the entrance must NOT touch
 * the transform (a `y` offset would fight that positioning). Applied as discrete
 * `initial`/`animate`/`transition` props rather than a `Variants` map.
 */
const listFade = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	transition: { duration: motionDuration.base, ease: ease.standard },
} as const;

export function SavedPromptsView() {
	const {
		entries,
		allTags,
		isLoading,
		isError,
		refetch,
		createPrompt,
		updatePrompt,
		deletePrompt,
		toggleFavorite,
		incrementUse,
		isCreating,
		isUpdating,
	} = useSavedPrompts();

	const { copyToClipboard } = useCopyToClipboard();
	const { insert } = useInsertPrompt();
	const variableCache = useVariableCache();

	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const [railFilter, setRailFilter] = useState<RailFilter>(RAIL_ALL);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [density, setDensity] = useState<Density>("comfortable");
	const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
	const [fillTarget, setFillTarget] = useState<VariableFillTarget | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);

	const searchRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// ── Derived counts for the rail ──────────────────────────────────────────
	const favoriteCount = useMemo(
		() => entries.filter((entry) => entry.favorite).length,
		[entries],
	);
	const recentCount = useMemo(
		() =>
			entries.filter(
				(entry) =>
					entry.lastUsedAt !== null &&
					Date.now() - entry.lastUsedAt < RECENT_WINDOW_MS,
			).length,
		[entries],
	);
	const tagCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const entry of entries) {
			for (const tag of entry.tags) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}
		return allTags.map((tag) => ({ tag, count: counts.get(tag) ?? 0 }));
	}, [entries, allTags]);

	// ── Filter → search → sort pipeline ──────────────────────────────────────
	const railFiltered = useMemo(() => {
		switch (railFilter.kind) {
			case "favorites":
				return entries.filter((entry) => entry.favorite);
			case "recent":
				return entries
					.filter((entry) => entry.lastUsedAt !== null)
					.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
			case "tag":
				return entries.filter((entry) => entry.tags.includes(railFilter.tag));
			default:
				return entries;
		}
	}, [entries, railFilter]);

	const tagFiltered = useMemo(() => {
		if (selectedTags.length === 0) return railFiltered;
		return railFiltered.filter((entry) =>
			selectedTags.every((tag) => entry.tags.includes(tag)),
		);
	}, [railFiltered, selectedTags]);

	const search = useMemo(() => createPromptSearch(tagFiltered), [tagFiltered]);
	const searched = useMemo(
		() => search.search(deferredQuery),
		[search, deferredQuery],
	);

	// Favorites first only on the default/"all" view (recent keeps its order).
	const visiblePrompts = useMemo(() => {
		if (railFilter.kind === "recent" || deferredQuery.trim().length > 0) {
			return searched;
		}
		return [...searched].sort((a, b) => {
			if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
			return b.updatedAt - a.updatedAt;
		});
	}, [searched, railFilter, deferredQuery]);

	// ── Virtualization ───────────────────────────────────────────────────────
	const rowHeight = density === "compact" ? 96 : 132;
	const virtualizer = useVirtualizer({
		count: visiblePrompts.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => rowHeight,
		overscan: 8,
	});

	// ── Insert / copy with variable handling ─────────────────────────────────
	const finishInsert = useCallback(
		(prompt: PromptEntry, text: string) => {
			const outcome = insert(text);
			incrementUse(prompt);
			if (outcome.mode === "in-place") {
				toast.success("Промпт вставлен");
			} else {
				void copyToClipboard(text);
				toast.success("Промпт скопирован — откройте чат, чтобы вставить");
			}
		},
		[insert, incrementUse, copyToClipboard],
	);

	const finishCopy = useCallback(
		(prompt: PromptEntry, text: string) => {
			void copyToClipboard(text);
			incrementUse(prompt);
			toast.success("Скопировано в буфер обмена");
		},
		[copyToClipboard, incrementUse],
	);

	const handleInsert = useCallback(
		(prompt: PromptEntry) => {
			if (hasVariables(prompt.body)) {
				setFillTarget({ prompt, action: "insert" });
				return;
			}
			finishInsert(prompt, renderPrompt(prompt.body, {}).text);
		},
		[finishInsert],
	);

	const handleCopy = useCallback(
		(prompt: PromptEntry) => {
			if (hasVariables(prompt.body)) {
				setFillTarget({ prompt, action: "copy" });
				return;
			}
			finishCopy(prompt, renderPrompt(prompt.body, {}).text);
		},
		[finishCopy],
	);

	const handleFillCommit = useCallback(
		(
			target: VariableFillTarget,
			renderedText: string,
			values: Record<string, string>,
		) => {
			variableCache.write(target.prompt.id, values);
			if (target.action === "insert") {
				finishInsert(target.prompt, renderedText);
			} else {
				finishCopy(target.prompt, renderedText);
			}
			setFillTarget(null);
		},
		[variableCache, finishInsert, finishCopy],
	);

	// ── CRUD handlers ────────────────────────────────────────────────────────
	const handleEditorSubmit = useCallback(
		(submit: PromptEditorSubmit) => {
			const onDone = (verb: string) => () => {
				setEditor({ mode: "closed" });
				toast.success(verb);
			};
			if (submit.id) {
				void updatePrompt({
					id: submit.id,
					title: submit.title,
					body: submit.body,
					tags: submit.tags,
					favorite: submit.favorite,
				}).then(onDone("Промпт обновлён"));
			} else {
				void createPrompt({
					title: submit.title,
					body: submit.body,
					tags: submit.tags,
					favorite: submit.favorite,
				}).then(onDone("Промпт сохранён"));
			}
		},
		[createPrompt, updatePrompt],
	);

	const handleDuplicate = useCallback((prompt: PromptEntry) => {
		setEditor({
			mode: "create",
			seed: {
				title: `${prompt.title} (копия)`,
				body: prompt.body,
				tags: prompt.tags,
				favorite: false,
			},
		});
	}, []);

	const handleSeedSave = useCallback(
		(example: DefaultPrompt) => {
			void createPrompt({ title: example.title, body: example.body }).then(() =>
				toast.success("Промпт сохранён"),
			);
		},
		[createPrompt],
	);

	// ── Cmd/Ctrl+K quick-picker + ⌘F search focus ────────────────────────────
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const meta = event.metaKey || event.ctrlKey;
			if (meta && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setPickerOpen((open) => !open);
			} else if (meta && event.key.toLowerCase() === "f") {
				event.preventDefault();
				searchRef.current?.focus();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const hasPrompts = entries.length > 0;
	const noResults = hasPrompts && visiblePrompts.length === 0 && !isLoading;

	const clearFilters = useCallback(() => {
		setQuery("");
		setSelectedTags([]);
		setRailFilter(RAIL_ALL);
	}, []);

	const toggleTag = useCallback((tag: string) => {
		setSelectedTags((prev) =>
			prev.includes(tag)
				? prev.filter((existing) => existing !== tag)
				: [...prev, tag],
		);
	}, []);

	return (
		<DashboardSurface bare>
			<div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
				{/* Header */}
				<header className="flex flex-col gap-3 border-b border-border px-6 py-4">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<h1 className="text-lg font-semibold text-foreground">
								Сохранённые промпты
							</h1>
							<p className="text-sm text-muted-foreground">
								Библиотека готовых промптов — переиспользуйте их в любом чате.
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="outline"
										onClick={() => setPickerOpen(true)}
										className="gap-2"
									>
										<LuSearch className="size-4" />
										<Kbd>⌘K</Kbd>
									</Button>
								</TooltipTrigger>
								<TooltipContent>Быстрый выбор промпта</TooltipContent>
							</Tooltip>
							<Button onClick={() => setEditor({ mode: "create" })}>
								<LuPlus className="size-4" />
								Новый промпт
							</Button>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<div className="relative flex-1">
							<LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								ref={searchRef}
								placeholder="Поиск по названию, тексту и тегам…"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Escape") setQuery("");
								}}
								className="pl-8"
							/>
						</div>
						<DensityToggle density={density} onChange={setDensity} />
					</div>
				</header>

				{/* Two-pane body */}
				<div className="flex min-h-0 flex-1 overflow-hidden">
					{hasPrompts && (
						<LeftRail
							filter={railFilter}
							onFilterChange={setRailFilter}
							totalCount={entries.length}
							favoriteCount={favoriteCount}
							recentCount={recentCount}
							tags={tagCounts}
						/>
					)}

					<div className="flex min-h-0 min-w-0 flex-1 flex-col">
						{hasPrompts && allTags.length > 0 && (
							<div className="border-b border-border">
								<TagFilterRow
									tags={allTags}
									selected={selectedTags}
									onToggle={toggleTag}
									onClear={() => setSelectedTags([])}
								/>
							</div>
						)}

						<div
							ref={scrollRef}
							className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
						>
							{isError ? (
								<ErrorBanner onRetry={() => void refetch()} />
							) : isLoading ? (
								<SkeletonCards />
							) : !hasPrompts ? (
								<EmptySeedGallery
									saving={isCreating}
									onSave={handleSeedSave}
									onInsert={(example) => {
										const outcome = insert(example.body);
										if (outcome.mode === "in-place") {
											toast.success("Промпт вставлен");
										} else {
											void copyToClipboard(example.body);
											toast.success(
												"Промпт скопирован — откройте чат, чтобы вставить",
											);
										}
									}}
									onCopy={(example) => {
										void copyToClipboard(example.body);
										toast.success("Скопировано в буфер обмена");
									}}
								/>
							) : noResults ? (
								<NoResults onClear={clearFilters} />
							) : (
								<div
									style={{
										height: virtualizer.getTotalSize(),
										position: "relative",
										width: "100%",
									}}
								>
									{/*
									 * Virtualized rows own their vertical placement via an inline
									 * `translateY`, so we deliberately do NOT use MotionList/
									 * MotionListItem here (their `y` stagger would fight the
									 * positioning transform). Each card fades in via an
									 * opacity-only entrance that leaves the transform untouched.
									 */}
									{virtualizer.getVirtualItems().map((virtualRow) => {
										const prompt = visiblePrompts[virtualRow.index];
										return (
											<motion.div
												key={prompt.id}
												data-index={virtualRow.index}
												ref={virtualizer.measureElement}
												initial={listFade.initial}
												animate={listFade.animate}
												transition={listFade.transition}
												style={{
													position: "absolute",
													top: 0,
													left: 0,
													width: "100%",
													transform: `translateY(${virtualRow.start}px)`,
												}}
												className="pb-2"
											>
												<PromptCard
													prompt={prompt}
													onInsert={handleInsert}
													onCopy={handleCopy}
													onEdit={(target) =>
														setEditor({ mode: "edit", prompt: target })
													}
													onDelete={(target) => deletePrompt(target.id)}
													onDuplicate={handleDuplicate}
													onToggleFavorite={(target) =>
														void toggleFavorite(target)
													}
												/>
											</motion.div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			<PromptEditorDialog
				state={editor}
				saving={isCreating || isUpdating}
				onClose={() => setEditor({ mode: "closed" })}
				onSubmit={handleEditorSubmit}
			/>

			<VariableFillDrawer
				target={fillTarget}
				cachedValues={
					fillTarget ? variableCache.read(fillTarget.prompt.id) : undefined
				}
				onOpenChange={(open) => !open && setFillTarget(null)}
				onCommit={handleFillCommit}
			/>

			<QuickPicker
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				prompts={entries}
				onPick={handleInsert}
			/>
		</DashboardSurface>
	);
}

function DensityToggle({
	density,
	onChange,
}: {
	density: Density;
	onChange: (density: Density) => void;
}) {
	const next = density === "comfortable" ? "compact" : "comfortable";
	const Icon = density === "comfortable" ? LuRows3 : LuLayoutList;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					size="icon"
					variant="outline"
					aria-label="Плотность списка"
					onClick={() => onChange(next)}
				>
					<Icon className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				{density === "comfortable" ? "Компактный вид" : "Просторный вид"}
			</TooltipContent>
		</Tooltip>
	);
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
	return (
		<div
			role="alert"
			className={cn(
				"flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3",
			)}
		>
			<span className="text-sm text-foreground">
				Не удалось загрузить промпты.
			</span>
			<Button size="sm" variant="outline" onClick={onRetry}>
				Повторить
			</Button>
		</div>
	);
}

function NoResults({ onClear }: { onClear: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
			<p className="text-sm text-muted-foreground">Ничего не найдено</p>
			<Button size="sm" variant="outline" onClick={onClear}>
				Очистить фильтры
			</Button>
		</div>
	);
}
