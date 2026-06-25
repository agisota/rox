import { cn } from "@rox/ui/utils";
import { GoGitPullRequest, GoIssueOpened } from "react-icons/go";
import { HiXMark } from "react-icons/hi2";
import { LuListTodo } from "react-icons/lu";

export type CrossLinkChipKind = "pr" | "issue" | "task";

interface CrossLinkChipProps {
	kind: CrossLinkChipKind;
	label: string;
	/** Optional `#42` style number prefix. */
	number?: number;
	onClick: () => void;
	/** When provided, renders an inline unlink affordance. */
	onRemove?: () => void;
}

const KIND_CONFIG: Record<
	CrossLinkChipKind,
	{ Icon: typeof GoGitPullRequest; className: string; removeLabel: string }
> = {
	pr: {
		Icon: GoGitPullRequest,
		className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
		removeLabel: "Отвязать PR",
	},
	issue: {
		Icon: GoIssueOpened,
		className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
		removeLabel: "Отвязать Issue",
	},
	task: {
		Icon: LuListTodo,
		className: "border-violet-500/30 bg-violet-500/10 text-violet-300",
		removeLabel: "Отвязать задачу",
	},
};

/**
 * Clickable cross-link chip rendered on both sides of a task↔PR/issue link.
 * Navigating is delegated to `onClick` so the same chip works on the task
 * detail (jump to PR/issue) and on a PR/issue surface (jump to the task).
 */
export function CrossLinkChip({
	kind,
	label,
	number,
	onClick,
	onRemove,
}: CrossLinkChipProps) {
	const cfg = KIND_CONFIG[kind];
	const Icon = cfg.Icon;
	return (
		<span
			className={cn(
				"inline-flex h-6 max-w-[14rem] items-center gap-1 rounded-full border pl-1.5 pr-1 text-[11px] font-medium",
				cfg.className,
			)}
		>
			<button
				type="button"
				onClick={onClick}
				className="inline-flex min-w-0 items-center gap-1 hover:underline"
				title={label}
			>
				<Icon className="size-3 shrink-0" />
				{number != null && (
					<span className="shrink-0 font-mono tabular-nums">#{number}</span>
				)}
				<span className="truncate">{label}</span>
			</button>
			{onRemove && (
				<button
					type="button"
					onClick={onRemove}
					aria-label={cfg.removeLabel}
					title={cfg.removeLabel}
					className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-current/70 hover:bg-background/40 hover:text-current"
				>
					<HiXMark className="size-3" />
				</button>
			)}
		</span>
	);
}
