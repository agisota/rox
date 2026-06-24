import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { LuCheck, LuCircleDot, LuClock, LuPlus, LuX } from "react-icons/lu";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import type {
	ChecksStatus,
	PrChecksSummary,
	PrListItem,
	ReviewDecision,
} from "./types";

interface PrRowProps {
	pr: PrListItem;
	onOpen: (prNumber: number) => void;
	onOpenUrl: (url: string) => void;
	onAddToWorkspace: (pr: PrListItem) => void;
}

const reviewDecisionConfig: Record<
	ReviewDecision,
	{ label: string; className: string }
> = {
	approved: {
		label: "Одобрено",
		className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
	},
	changes_requested: {
		label: "Правки",
		className: "bg-red-500/15 text-red-300 border-red-500/30",
	},
	review_required: {
		label: "Ревью",
		className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
	},
};

const checksConfig: Record<
	ChecksStatus,
	{ icon: typeof LuCheck; className: string }
> = {
	passing: { icon: LuCheck, className: "text-emerald-400" },
	failing: { icon: LuX, className: "text-red-400" },
	pending: { icon: LuClock, className: "text-amber-400" },
	none: { icon: LuCircleDot, className: "text-muted-foreground" },
};

function ReviewDecisionPill({ decision }: { decision: ReviewDecision }) {
	const cfg = reviewDecisionConfig[decision];
	return (
		<span
			className={cn(
				"hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium @lg:inline-flex",
				cfg.className,
			)}
		>
			{cfg.label}
		</span>
	);
}

function ChecksIndicator({ checks }: { checks: PrChecksSummary }) {
	const cfg = checksConfig[checks.status];
	const Icon = cfg.icon;
	return (
		<span
			className={cn(
				"hidden shrink-0 items-center gap-1 text-[11px] tabular-nums @md:inline-flex",
				cfg.className,
			)}
			title={`Проверки: ${checks.passed}/${checks.total}`}
		>
			<Icon className="size-3" />
			{checks.total > 0 && (
				<span className="font-mono">
					{checks.passed}/{checks.total}
				</span>
			)}
		</span>
	);
}

/**
 * Dense single-line PR row (h-11) with the inline signal cluster.
 *
 * Phase-1: `reviewDecision` / `checks` are null (host doesn't return them yet),
 * so those pills render only when present — the row degrades to state + draft
 * cleanly and lights up automatically once the backend ships the fields.
 */
export function PrRow({ pr, onOpen, onOpenUrl, onAddToWorkspace }: PrRowProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: row contains nested action buttons, so the outer element is a div with role/tabIndex
		<div
			className={cn(
				"group flex h-11 items-center gap-3 border-b border-border/50 px-4 cursor-pointer hover:bg-accent/50",
				pr.state === "merged" && "opacity-70",
			)}
			onClick={() => onOpen(pr.prNumber)}
			onKeyDown={(e) => {
				if (e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen(pr.prNumber);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<PRIcon state={pr.state} className="size-4 shrink-0" />
			<span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
				#{pr.prNumber}
			</span>
			<span className="min-w-0 flex-1 truncate text-sm font-medium">
				{pr.title}
			</span>

			{pr.isDraft && (
				<span className="hidden shrink-0 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground @md:inline-flex">
					Черновик
				</span>
			)}
			{pr.reviewDecision && <ReviewDecisionPill decision={pr.reviewDecision} />}
			{pr.checks && <ChecksIndicator checks={pr.checks} />}
			{pr.commentCount != null && pr.commentCount > 0 && (
				<span className="hidden shrink-0 text-[11px] text-muted-foreground tabular-nums @lg:inline">
					{pr.commentCount} 💬
				</span>
			)}

			{pr.authorLogin && (
				<span className="hidden shrink-0 text-xs text-muted-foreground @md:inline">
					{pr.authorLogin}
				</span>
			)}

			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon-xs"
					title="Открыть в браузере"
					onClick={(e) => {
						e.stopPropagation();
						onOpenUrl(pr.url);
					}}
				>
					<HiOutlineArrowTopRightOnSquare className="size-3.5" />
				</Button>
				<Button
					variant="outline"
					size="sm"
					title="В рабочее пространство"
					className="h-7 gap-1.5 px-2 text-xs"
					onClick={(e) => {
						e.stopPropagation();
						onAddToWorkspace(pr);
					}}
				>
					<LuPlus className="size-3.5" />
					<span className="hidden @xl:inline">В рабочее пространство</span>
				</Button>
			</div>
		</div>
	);
}
