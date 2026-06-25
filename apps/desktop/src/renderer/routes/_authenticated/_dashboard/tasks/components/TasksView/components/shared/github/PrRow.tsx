import { Button } from "@rox/ui/button";
import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { LuCheck, LuCircleDot, LuClock, LuPlus, LuX } from "react-icons/lu";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import { formatRelativeUpdatedAt } from "./relativeUpdatedAt";
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

/**
 * Layout-motion transition shared by the reviewDecision/checks pills: a quick
 * `layout` reflow plus an opacity crossfade keyed on the status value, so the
 * pills smoothly rebuild when enrichment flips a decision/check status. Gated by
 * the caller's `shouldAnimate` (essential tier → `prefers-reduced-motion`
 * snaps straight to the final state).
 */
const pillTransition = {
	duration: motionDuration.fast,
	ease: ease.standard,
};

function ReviewDecisionPill({
	decision,
	shouldAnimate,
}: {
	decision: ReviewDecision;
	shouldAnimate: boolean;
}) {
	const cfg = reviewDecisionConfig[decision];
	const className = cn(
		"hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium @lg:inline-flex",
		cfg.className,
	);
	if (!shouldAnimate) {
		return <span className={className}>{cfg.label}</span>;
	}
	return (
		<AnimatePresence mode="popLayout" initial={false}>
			<motion.span
				key={decision}
				layout
				className={className}
				initial={{ opacity: 0, scale: 0.9 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.9 }}
				transition={pillTransition}
			>
				{cfg.label}
			</motion.span>
		</AnimatePresence>
	);
}

function ChecksIndicator({
	checks,
	shouldAnimate,
}: {
	checks: PrChecksSummary;
	shouldAnimate: boolean;
}) {
	const cfg = checksConfig[checks.status];
	const Icon = cfg.icon;
	const className = cn(
		"hidden shrink-0 items-center gap-1 text-[11px] tabular-nums @md:inline-flex",
		cfg.className,
	);
	const content = (
		<>
			<Icon className="size-3" />
			{checks.total > 0 && (
				<span className="font-mono">
					{checks.passed}/{checks.total}
				</span>
			)}
		</>
	);
	const title = `Проверки: ${checks.passed}/${checks.total}`;
	if (!shouldAnimate) {
		return (
			<span className={className} title={title}>
				{content}
			</span>
		);
	}
	return (
		<AnimatePresence mode="popLayout" initial={false}>
			<motion.span
				key={checks.status}
				layout
				className={className}
				title={title}
				initial={{ opacity: 0, scale: 0.9 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.9 }}
				transition={pillTransition}
			>
				{content}
			</motion.span>
		</AnimatePresence>
	);
}

/**
 * Dense single-line PR row (h-11) with the inline signal cluster.
 *
 * `reviewDecision` / `checks` come from the enriched host listing and may be
 * null (GitHub has no data / Octokit fallback) — those pills render only when
 * present, so the row degrades to state + draft cleanly. When the values change
 * (enrichment lands or status flips) the pills layout-animate via framer-motion,
 * gated on the essential motion tier (`prefers-reduced-motion` → instant final).
 */
export function PrRow({ pr, onOpen, onOpenUrl, onAddToWorkspace }: PrRowProps) {
	const relativeUpdatedAt = formatRelativeUpdatedAt(pr.updatedAt);
	// Essential tier: pills convey state, so they animate under `full`/`essential`
	// but snap to final under `prefers-reduced-motion`/`off`.
	const shouldAnimate = useShouldAnimate("essential");
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
			{pr.reviewDecision && (
				<ReviewDecisionPill
					decision={pr.reviewDecision}
					shouldAnimate={shouldAnimate}
				/>
			)}
			{pr.checks && (
				<ChecksIndicator checks={pr.checks} shouldAnimate={shouldAnimate} />
			)}
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
			{relativeUpdatedAt && (
				<span className="hidden shrink-0 text-[11px] text-muted-foreground @xl:inline">
					{relativeUpdatedAt}
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
