"use client";

import { sessionMatchesRule as sessionPasses } from "@rox/shared/chat-saved-view";
import { useState } from "react";

import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { Input } from "../ui/input";
import {
	type ChipMode,
	type ChipSelection,
	chipSelectionToRule,
	deriveRailChips,
	deriveSmartFolders,
	type RailLabel,
	type RailSavedView,
	type RailSession,
	type RailSmartFolder,
} from "./saved-view-rail";

export interface SavedViewRailProps {
	/** The distinct org label registry (`chatLabels.list`). */
	labels: readonly RailLabel[];
	/** Persisted user Saved Views (`chatSavedViews.list`). */
	savedViews: readonly RailSavedView[];
	/** Current boolean-chip selection; drives which chips are accent-filled. */
	selection: ChipSelection;
	/** Already-loaded sessions, for the live counters. */
	sessions: readonly RailSession[];
	/** Cycle a label chip's axis (off → any → all → none). */
	onToggleChip: (name: string) => void;
	/** Apply a built-in Smart Folder's rule to the rail. */
	onSelectSmartFolder?: (folder: RailSmartFolder) => void;
	/** Apply a persisted Saved View's rule to the rail. */
	onSelectSavedView?: (view: RailSavedView) => void;
	/** Persist the current chip selection as a new Saved View (`create`). */
	onSaveCurrentView?: (
		name: string,
		rule: ReturnType<typeof chipSelectionToRule>,
	) => void;
	/** Delete a persisted Saved View (`delete`). */
	onDeleteSavedView?: (view: RailSavedView) => void;
	className?: string;
}

/** Per-axis chip chrome: glyph prefix + accent class. */
const CHIP_MODE_META: Record<ChipMode, { glyph: string; accent: string }> = {
	off: { glyph: "", accent: "" },
	any: { glyph: "∨", accent: "bg-accent text-accent-foreground" },
	all: { glyph: "∧", accent: "bg-primary text-primary-foreground" },
	none: {
		glyph: "¬",
		accent: "bg-destructive/15 text-destructive line-through",
	},
};

const CHIP_BASE =
	"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const SECTION_HEADER =
	"px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * Presentational chat Saved-View rail (Hermes-borrow F17).
 *
 * Three collapsible-style sections forked from the `DashboardSidebar` section
 * model: Smart Folders (built-in preset rules with live counts), Saved Views
 * (persisted user rules), and the live boolean tag chips (OR/AND/NOT axes via a
 * cycling chip). A live counter reflects how many loaded sessions the current
 * chip selection keeps. All data flows in via props and every mutation flows out
 * via callbacks, so the same component drives web, desktop, and mobile from a
 * single core (the platform owns the tRPC wiring).
 */
export function SavedViewRail({
	labels,
	savedViews,
	selection,
	sessions,
	onToggleChip,
	onSelectSmartFolder,
	onSelectSavedView,
	onSaveCurrentView,
	onDeleteSavedView,
	className,
}: SavedViewRailProps) {
	const chips = deriveRailChips(labels, selection);
	const smartFolders = deriveSmartFolders(sessions);
	const currentRule = chipSelectionToRule(selection);
	const matchCount = sessions.filter((session) =>
		sessionPasses(currentRule, session),
	).length;
	const hasActiveChips = Object.keys(selection).length > 0;

	return (
		<nav
			aria-label="Saved views and tag filters"
			className={cn("flex w-full min-w-0 flex-col gap-3", className)}
		>
			<section aria-label="Smart folders" className="flex flex-col gap-1">
				<div className={SECTION_HEADER}>Smart Folders</div>
				{smartFolders.map((folder) => (
					<button
						key={folder.id}
						type="button"
						data-folder={folder.id}
						onClick={() => onSelectSmartFolder?.(folder)}
						className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<span className="truncate">{folder.name}</span>
						{folder.serverComplete && (
							<span className="text-xs tabular-nums opacity-70">
								{folder.count}
							</span>
						)}
					</button>
				))}
			</section>

			{savedViews.length > 0 && (
				<section aria-label="Saved views" className="flex flex-col gap-1">
					<div className={SECTION_HEADER}>Saved Views</div>
					{savedViews.map((view) => (
						<div
							key={view.id}
							className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
						>
							<button
								type="button"
								data-saved-view={view.id}
								onClick={() => onSelectSavedView?.(view)}
								className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
							>
								<span
									aria-hidden
									className="size-1.5 shrink-0 rounded-full"
									style={{
										backgroundColor: view.color ?? "var(--muted-foreground)",
									}}
								/>
								<span className="truncate">{view.name}</span>
							</button>
							{onDeleteSavedView && (
								<button
									type="button"
									aria-label={`Delete saved view ${view.name}`}
									onClick={() => onDeleteSavedView(view)}
									className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
								>
									×
								</button>
							)}
						</div>
					))}
				</section>
			)}

			<section aria-label="Tag filter" className="flex flex-col gap-1.5">
				<div className="flex items-center justify-between">
					<div className={SECTION_HEADER}>Filter by tag</div>
					<span className="px-1 text-[10px] tabular-nums text-muted-foreground">
						{matchCount} match{matchCount === 1 ? "" : "es"}
					</span>
				</div>
				<div
					role="toolbar"
					aria-label="Boolean tag chips"
					className="flex w-full min-w-0 flex-wrap items-center gap-1.5"
				>
					{chips.map((chip) => {
						const meta = CHIP_MODE_META[chip.mode];
						return (
							<button
								key={chip.key}
								type="button"
								data-chip={chip.key}
								data-mode={chip.mode}
								aria-pressed={chip.mode !== "off"}
								onClick={() => onToggleChip(chip.name)}
								className={cn(
									CHIP_BASE,
									chip.mode === "off"
										? "text-muted-foreground hover:bg-muted hover:text-foreground"
										: meta.accent,
								)}
							>
								{meta.glyph && (
									<span aria-hidden className="font-mono text-[10px]">
										{meta.glyph}
									</span>
								)}
								<span
									aria-hidden
									className="size-1.5 shrink-0 rounded-full"
									style={{ backgroundColor: chip.color }}
								/>
								{chip.name}
							</button>
						);
					})}
				</div>
				{hasActiveChips && onSaveCurrentView && (
					<SaveViewPill
						onSave={(name) => onSaveCurrentView(name, currentRule)}
					/>
				)}
			</section>
		</nav>
	);
}

/** Inline `Save view` control that names + persists the current chip selection. */
function SaveViewPill({ onSave }: { onSave: (name: string) => void }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");

	const submit = () => {
		const trimmed = name.trim();
		if (trimmed) {
			onSave(trimmed);
		}
		setName("");
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						CHIP_BASE,
						"self-start border border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground",
					)}
				>
					Save view
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-2">
				<Input
					autoFocus
					value={name}
					placeholder="View name"
					onChange={(event) => setName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							submit();
						}
						if (event.key === "Escape") {
							setOpen(false);
						}
					}}
					onBlur={submit}
				/>
			</PopoverContent>
		</Popover>
	);
}
