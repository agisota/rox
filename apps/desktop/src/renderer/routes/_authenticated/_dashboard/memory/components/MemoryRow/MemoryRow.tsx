import type { MemoryCategory, SelectMemoryItem } from "@rox/db/schema";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { useShouldAnimate } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useEffect, useRef, useState } from "react";
import Highlighter from "react-highlight-words";
import {
	HiOutlineEllipsisHorizontal,
	HiOutlinePencil,
	HiOutlineTrash,
} from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	CATEGORY_LABEL,
	MEMORY_GROUPS,
} from "renderer/screens/memory/MemoryView/groups";
import { provenanceLabel } from "../../lib/provenance";

interface MemoryRowProps {
	item: SelectMemoryItem;
	/** Highlight terms (search mode); empty for the plain grouped view. */
	searchWords?: string[];
	/** Show a small category badge (search mode mixes categories). */
	showCategory?: boolean;
	/** Pulse the row once (command-palette "jump to memory"). */
	flash?: boolean;
}

/**
 * One approved memory: read view with optional matched-term highlighting, plus
 * the three retrieval-UI actions that were previously impossible —
 *
 *  • edit-in-place (click body or pencil → auto-growing Textarea; Enter/blur
 *    commits, Esc cancels) preserving id/createdAt/source/sourceRef instead of
 *    the destructive delete-and-retype;
 *  • move category (existing memory.updateGroup);
 *  • delete (existing memory.remove).
 *
 * All writes go through the optimistic Electric collection.
 *
 * NOTE: the body-edit mutation applies optimistically and renders immediately;
 * server persistence additionally needs the `memoryRouter.update` mutation +
 * the collections.ts onUpdate body branch (flagged as needsShared — both live
 * outside this surface folder). Category/delete already persist today.
 */
export function MemoryRow({
	item,
	searchWords = [],
	showCategory = false,
	flash = false,
}: MemoryRowProps) {
	const collections = useCollections();
	const shouldAnimate = useShouldAnimate();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(item.body);
	const [pulsing, setPulsing] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// One-shot ring pulse when the command palette jumps to this row.
	useEffect(() => {
		if (!flash || !shouldAnimate) return;
		setPulsing(true);
		const t = setTimeout(() => setPulsing(false), 1100);
		return () => clearTimeout(t);
	}, [flash, shouldAnimate]);

	// Keep the draft in sync if the item changes underneath us while not editing.
	useEffect(() => {
		if (!editing) setDraft(item.body);
	}, [item.body, editing]);

	useEffect(() => {
		if (editing) {
			const el = textareaRef.current;
			if (el) {
				el.focus();
				el.setSelectionRange(el.value.length, el.value.length);
			}
		}
	}, [editing]);

	const commit = () => {
		const next = draft.trim();
		setEditing(false);
		if (!next || next === item.body) {
			setDraft(item.body);
			return;
		}
		const tx = collections.memoryItems.update(item.id, (d) => {
			d.body = next;
			d.updatedAt = new Date();
		});
		void tx.isPersisted.promise.catch(() =>
			toast.error("Не удалось сохранить изменение — попробуйте ещё раз"),
		);
	};

	const cancel = () => {
		setDraft(item.body);
		setEditing(false);
	};

	const move = (category: string) => {
		if (category === item.category) return;
		const tx = collections.memoryItems.update(item.id, (d) => {
			d.category = category as MemoryCategory;
		});
		void tx.isPersisted.promise.catch(() =>
			toast.error("Не удалось переместить — попробуйте ещё раз"),
		);
	};

	const remove = () => {
		const tx = collections.memoryItems.delete(item.id);
		void tx.isPersisted.promise.catch(() =>
			toast.error("Не удалось удалить — попробуйте ещё раз"),
		);
	};

	const provenance = provenanceLabel(item);

	return (
		<div
			id={`memory-row-${item.id}`}
			className={cn(
				"group/row flex scroll-mt-24 items-start gap-2 rounded-md bg-muted/40 px-2.5 py-2 transition-all",
				!editing && "hover:bg-muted/60",
				pulsing && "bg-primary/10 ring-2 ring-primary/50",
			)}
		>
			{showCategory && (
				<span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
					{CATEGORY_LABEL[item.category]}
				</span>
			)}

			<div className="min-w-0 flex-1">
				{editing ? (
					<Textarea
						ref={textareaRef}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								commit();
							} else if (e.key === "Escape") {
								e.preventDefault();
								cancel();
							}
						}}
						onBlur={commit}
						maxLength={4000}
						className="min-h-0 resize-none border-border/60 bg-background py-1 text-sm leading-snug"
						aria-label="Редактировать запись"
					/>
				) : (
					<button
						type="button"
						onClick={() => setEditing(true)}
						className="block w-full cursor-text text-left text-foreground text-sm leading-snug"
						title="Нажмите, чтобы изменить"
					>
						{searchWords.length > 0 ? (
							<Highlighter
								searchWords={searchWords}
								textToHighlight={item.body}
								autoEscape
								highlightClassName="rounded-sm bg-primary/30 text-foreground"
							/>
						) : (
							item.body
						)}
					</button>
				)}

				{provenance && !editing && (
					<p className="mt-0.5 text-[10px] text-muted-foreground/70">
						{provenance}
					</p>
				)}
			</div>

			{!editing && (
				<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
					<button
						type="button"
						aria-label="Изменить"
						onClick={() => setEditing(true)}
						className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
					>
						<HiOutlinePencil className="size-3.5" />
					</button>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label="Ещё"
								className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
							>
								<HiOutlineEllipsisHorizontal className="size-3.5" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-44">
							<DropdownMenuLabel className="text-xs">
								Переместить в…
							</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={item.category}
								onValueChange={move}
							>
								{MEMORY_GROUPS.map((group) => (
									<DropdownMenuRadioItem
										key={group.category}
										value={group.category}
										className="text-xs"
									>
										{group.label}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={remove}
								className="text-destructive text-xs focus:text-destructive"
							>
								<HiOutlineTrash className="size-3.5" />
								Удалить
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			)}
		</div>
	);
}
