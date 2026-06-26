"use client";

import {
	GitBranch,
	GitFork,
	type LucideIcon,
	MessageCircle,
	MessagesSquare,
	Send,
	Sparkles,
	Star,
	Terminal,
	Trash2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
	deriveLabelDots,
	deriveSourceChips,
	hasWorktreeMeta,
	type SessionRowData,
	type SessionRowDensity,
	type SessionSource,
	showsForkBadge,
	sourceLabel,
} from "./session-row";

/**
 * The single, rich, presentational chat row (Hermes-borrow F20). One
 * props-driven implementation consumed by both desktop `SessionSelector` call
 * sites and web; RN renders a native row from the same `session-row.ts`
 * contract. The row is purely presentational — confirmation dialogs / toasts /
 * data wiring stay in the host (the desktop `SessionSelectorItem` wrapper).
 *
 * Composition (left→right): colour dot(s) (F12) · title · source chips · fork
 * badge · time · pin (F19) · delete. `detailed` density adds a worktree/branch
 * meta row beneath the title.
 */
export interface SessionRowProps {
	/** The full row descriptor (see `SessionRowData`). */
	data: SessionRowData;
	/** `compact` (dropdown) or `detailed` (adds worktree/branch meta row). */
	density?: SessionRowDensity;
	/** Select/open the session. */
	onSelect: (sessionId: string) => void;
	/** Toggle pin (F19). Omit to hide the pin affordance. */
	onSetPinned?: (sessionId: string, pinned: boolean) => void;
	/** Delete the session. Omit (or for the current session) to hide delete. */
	onDelete?: (sessionId: string) => void;
	/** Pin button labels (host supplies localized copy). */
	pinLabel?: string;
	unpinLabel?: string;
	/** Delete button a11y label (host supplies localized copy). */
	deleteLabel?: string;
	/** Placeholder when `title` is empty. */
	emptyTitleLabel?: string;
	className?: string;
}

const SOURCE_ICON: Record<SessionSource, LucideIcon> = {
	cli: Terminal,
	"claude-code": Sparkles,
	telegram: Send,
	discord: MessageCircle,
	slack: MessagesSquare,
};

export function SessionRow({
	data,
	density = "compact",
	onSelect,
	onSetPinned,
	onDelete,
	pinLabel = "Pin",
	unpinLabel = "Unpin",
	deleteLabel = "Delete",
	emptyTitleLabel = "New Chat",
	className,
}: SessionRowProps) {
	const {
		sessionId,
		title,
		isCurrent,
		pinned,
		labels,
		sources,
		lineage,
		timeLabel,
	} = data;

	const { dots, overflow } = deriveLabelDots(labels);
	const chips = deriveSourceChips(sources);
	const showFork = showsForkBadge(lineage);
	const showDelete = Boolean(onDelete) && !isCurrent;
	const showMeta = density === "detailed" && hasWorktreeMeta(data);

	return (
		<div
			className={cn("group flex w-full min-w-0 items-center gap-2", className)}
			data-session-id={sessionId}
			data-density={density}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
				onClick={() => onSelect(sessionId)}
			>
				<span className="flex w-full min-w-0 items-center gap-1.5">
					{dots.length > 0 && (
						<span className="flex shrink-0 items-center gap-0.5">
							{dots.map((label) => (
								<span
									key={label.name}
									role="img"
									className="size-2 rounded-full"
									style={{ backgroundColor: label.color }}
									title={label.name}
									aria-label={label.name}
								/>
							))}
							{overflow > 0 && (
								<span className="text-[10px] text-muted-foreground">
									+{overflow}
								</span>
							)}
						</span>
					)}
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-xs",
							isCurrent && "font-semibold",
						)}
					>
						{title || emptyTitleLabel}
					</span>
					{chips.length > 0 && (
						<span className="flex shrink-0 items-center gap-1">
							{chips.map((chip) => {
								const Icon = SOURCE_ICON[chip.source];
								return (
									<span
										key={chip.source}
										className="flex items-center gap-0.5 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground"
										title={sourceLabel(chip.source)}
									>
										<Icon className="size-2.5" />
										{density === "detailed" && <span>{chip.label}</span>}
									</span>
								);
							})}
						</span>
					)}
					{showFork && (
						<span
							role="img"
							className="flex shrink-0 items-center text-muted-foreground"
							title={lineage?.parentTitle}
							aria-label="Fork"
						>
							<GitFork className="size-3" />
						</span>
					)}
					{timeLabel && (
						<span className="shrink-0 text-[10px] text-muted-foreground">
							{timeLabel}
						</span>
					)}
				</span>
				{showMeta && (
					<span className="flex w-full min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
						{data.worktree?.trim() && (
							<span className="truncate" title={data.worktree}>
								{data.worktree}
							</span>
						)}
						{data.branch?.trim() && (
							<span className="flex min-w-0 items-center gap-0.5">
								<GitBranch className="size-2.5 shrink-0" />
								<span className="truncate" title={data.branch}>
									{data.branch}
								</span>
							</span>
						)}
					</span>
				)}
			</button>

			{onSetPinned && (
				<button
					type="button"
					title={pinned ? unpinLabel : pinLabel}
					aria-label={pinned ? unpinLabel : pinLabel}
					className={cn(
						"shrink-0 rounded p-0.5 transition-opacity hover:bg-muted",
						pinned
							? "text-amber-500 opacity-100"
							: "opacity-0 group-hover:opacity-100",
					)}
					onClick={(event) => {
						event.stopPropagation();
						onSetPinned(sessionId, !pinned);
					}}
				>
					<Star className="size-3" fill={pinned ? "currentColor" : "none"} />
				</button>
			)}

			{showDelete && (
				<button
					type="button"
					title={deleteLabel}
					aria-label={deleteLabel}
					className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
					onClick={(event) => {
						event.stopPropagation();
						onDelete?.(sessionId);
					}}
				>
					<Trash2 className="size-3" />
				</button>
			)}
		</div>
	);
}
