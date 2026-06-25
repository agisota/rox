"use client";

import { useState } from "react";

import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/context-menu";
import { Input } from "../ui/input";
import {
	deriveTagPills,
	type TagFilterState,
	type TagLabel,
	type TagPill,
} from "./tag-filter";

export interface TagFilterPillBarProps {
	/** The distinct org label registry (`chatLabels.list`). */
	labels: readonly TagLabel[];
	/** Current tri-state filter; drives which pill is accent-filled. */
	filter: TagFilterState;
	/** Toggle/select a pill (`all` · `unassigned` · a label name). */
	onSelectPill: (pill: TagPill) => void;
	/** Inline-create a new label (`chatLabels.create`). */
	onCreateLabel?: (name: string) => void;
	/** Rename a label (`chatLabels.update`). */
	onRenameLabel?: (label: TagLabel, name: string) => void;
	/** Recolour a label (`chatLabels.update`). */
	onRecolorLabel?: (label: TagLabel, color: string) => void;
	/** Delete a label (`chatLabels.delete`). */
	onDeleteLabel?: (label: TagLabel) => void;
	className?: string;
}

/** Base pill chrome shared by every pill kind. */
const PILL_BASE =
	"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Presentational tag pill-bar over a chat list (Hermes-borrow F10).
 *
 * Renders the derived pill row — `All`, dashed `Unassigned`, one pill per label
 * with a 6px colour dot — plus a dashed `+` that inline-creates a label. The
 * active pill is accent-filled. Right-click / long-press a label pill to
 * rename, recolour, or delete it. All data flows in via props and all mutations
 * flow out via callbacks, so the same component drives web, desktop, and mobile
 * from a single core (the platform owns the tRPC wiring).
 */
export function TagFilterPillBar({
	labels,
	filter,
	onSelectPill,
	onCreateLabel,
	onRenameLabel,
	onRecolorLabel,
	onDeleteLabel,
	className,
}: TagFilterPillBarProps) {
	const pills = deriveTagPills(labels, filter);
	const labelById = new Map(labels.map((label) => [label.id, label]));

	return (
		<div
			role="toolbar"
			aria-label="Filter chats by tag"
			className={cn(
				"flex w-full min-w-0 items-center gap-1.5 overflow-x-auto",
				className,
			)}
		>
			{pills.map((pill) => {
				if (pill.kind !== "label") {
					return (
						<SimplePill
							key={pill.key}
							pill={pill}
							onSelect={() => onSelectPill(pill)}
						/>
					);
				}

				const label = labelById.get(pill.key.slice("label:".length));
				const labelPill = (
					<LabelPill pill={pill} onSelect={() => onSelectPill(pill)} />
				);

				// No mutation handlers → plain pill (no context menu).
				if (!label || (!onRenameLabel && !onRecolorLabel && !onDeleteLabel)) {
					return <span key={pill.key}>{labelPill}</span>;
				}

				return (
					<ContextMenu key={pill.key}>
						<ContextMenuTrigger asChild>{labelPill}</ContextMenuTrigger>
						<ContextMenuContent className="w-44">
							{onRenameLabel && (
								<ContextMenuItem
									onSelect={() => {
										const next = window.prompt("Rename label", label.name);
										if (next?.trim() && next.trim() !== label.name) {
											onRenameLabel(label, next.trim());
										}
									}}
								>
									Rename
								</ContextMenuItem>
							)}
							{onRecolorLabel && (
								<ContextMenuItem
									onSelect={() => {
										const next = window.prompt(
											"Label colour (CSS)",
											pill.color,
										);
										if (next?.trim()) {
											onRecolorLabel(label, next.trim());
										}
									}}
								>
									Recolour
								</ContextMenuItem>
							)}
							{onDeleteLabel && (
								<>
									<ContextMenuSeparator />
									<ContextMenuItem
										variant="destructive"
										onSelect={() => onDeleteLabel(label)}
									>
										Delete
									</ContextMenuItem>
								</>
							)}
						</ContextMenuContent>
					</ContextMenu>
				);
			})}

			{onCreateLabel && <CreatePill onCreate={onCreateLabel} />}
		</div>
	);
}

/** `All` / `Unassigned` pills — no colour dot. */
function SimplePill({
	pill,
	onSelect,
}: {
	pill: TagPill;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			data-pill={pill.key}
			aria-pressed={pill.active}
			onClick={onSelect}
			className={cn(
				PILL_BASE,
				pill.active
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-muted hover:text-foreground",
				pill.kind === "unassigned" &&
					!pill.active &&
					"border border-dashed border-border",
			)}
		>
			{pill.label}
		</button>
	);
}

/** A label pill with its 6px colour dot. */
function LabelPill({
	pill,
	onSelect,
}: {
	pill: TagPill;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			data-pill={pill.key}
			aria-pressed={pill.active}
			onClick={onSelect}
			className={cn(
				PILL_BASE,
				pill.active
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<span
				aria-hidden
				className="size-1.5 shrink-0 rounded-full"
				style={{ backgroundColor: pill.color }}
			/>
			{pill.label}
		</button>
	);
}

/** Dashed `+` pill that opens an inline name field to create a label. */
function CreatePill({ onCreate }: { onCreate: (name: string) => void }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");

	const submit = () => {
		const trimmed = name.trim();
		if (trimmed) {
			onCreate(trimmed);
		}
		setName("");
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Create label"
					className={cn(
						PILL_BASE,
						"border border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground",
					)}
				>
					+
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-2">
				<Input
					autoFocus
					value={name}
					placeholder="New label"
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
