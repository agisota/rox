import type { GitHubStatus } from "@rox/local-db";
import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { motion } from "framer-motion";
import {
	LuCheck,
	LuGitMerge,
	LuGitPullRequestArrow,
	LuGitPullRequestClosed,
	LuGitPullRequestDraft,
	LuLoaderCircle,
	LuX,
} from "react-icons/lu";
import { STROKE_WIDTH } from "../constants";

type PullRequest = NonNullable<GitHubStatus["pr"]>;
type PRState = PullRequest["state"];
type ReviewDecision = PullRequest["reviewDecision"];
type ChecksStatus = PullRequest["checksStatus"];

/**
 * Always-visible, compact git/PR status cluster for a sidebar branch row.
 *
 * Reads ONLY data already present in the TanStack Query cache for this
 * workspace (the same `workspaces.getGitHubStatus` key the hover-card and the
 * active-surface 10s poll write). It NEVER triggers a fetch of its own, so it
 * adds zero load to `githubQueryPolicy` — hover still drives refresh. This is
 * the cache-first contract: render whatever signal we already have, refresh
 * lazily. When nothing is cached the cluster collapses to ahead/behind (or
 * nothing), exactly matching the previous hover-only behaviour minus the gate.
 */

const PR_STATE_CONFIG: Record<
	PRState,
	{
		icon: typeof LuGitPullRequestArrow;
		color: string;
		bg: string;
		label: string;
	}
> = {
	open: {
		icon: LuGitPullRequestArrow,
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
		label: "PR открыт",
	},
	draft: {
		icon: LuGitPullRequestDraft,
		color: "text-muted-foreground",
		bg: "bg-muted/60",
		label: "Черновик PR",
	},
	merged: {
		icon: LuGitMerge,
		color: "text-violet-500",
		bg: "bg-violet-500/10",
		label: "PR влит",
	},
	closed: {
		icon: LuGitPullRequestClosed,
		color: "text-destructive-foreground",
		bg: "bg-destructive/10",
		label: "PR закрыт",
	},
};

const REVIEW_CONFIG: Record<ReviewDecision, { dot: string; label: string }> = {
	approved: { dot: "bg-emerald-500", label: "Одобрено" },
	changes_requested: { dot: "bg-destructive", label: "Запрошены правки" },
	pending: { dot: "bg-amber-500", label: "Ожидает ревью" },
};

const CHECKS_CONFIG: Record<
	Exclude<ChecksStatus, "none">,
	{ icon: typeof LuCheck; color: string; spin?: boolean }
> = {
	success: { icon: LuCheck, color: "text-emerald-500" },
	failure: { icon: LuX, color: "text-destructive-foreground" },
	pending: { icon: LuLoaderCircle, color: "text-amber-500", spin: true },
};

interface WorkspaceRowStatusProps {
	/** Cached PR signal, if any. */
	pr: PullRequest | null | undefined;
	/** Cached ahead/behind for branch workspaces, if any. */
	aheadBehind?: { ahead: number; behind: number } | null;
	isActive?: boolean;
	className?: string;
}

export function WorkspaceRowStatus({
	pr,
	aheadBehind,
	isActive,
	className,
}: WorkspaceRowStatusProps) {
	const animate = useShouldAnimate("decorative");

	const ahead = aheadBehind?.ahead ?? 0;
	const behind = aheadBehind?.behind ?? 0;
	const hasAheadBehind = ahead > 0 || behind > 0;

	// Nothing cached worth showing yet — collapse entirely so the row stays clean
	// until the hover-driven (or active-poll) fetch populates the cache.
	if (!pr && !hasAheadBehind) return null;

	const checksVisible =
		!!pr && pr.state === "open" && pr.checksStatus !== "none";
	const passing = pr
		? pr.checks.filter((c) => c.status === "success").length
		: 0;
	const total = pr
		? pr.checks.filter(
				(c) => c.status !== "skipped" && c.status !== "cancelled",
			).length
		: 0;

	return (
		<motion.div
			layout
			initial={animate ? { opacity: 0, x: -3 } : false}
			animate={{ opacity: 1, x: 0 }}
			transition={{ duration: motionDuration.fast, ease: ease.standard }}
			className={cn("flex items-center gap-1 shrink-0", className)}
		>
			{hasAheadBehind && (
				<Tooltip delayDuration={400}>
					<TooltipTrigger asChild>
						<span className="flex items-center gap-1 font-mono text-[10px] tabular-nums leading-none">
							{behind > 0 && <span className="text-amber-500">↓{behind}</span>}
							{ahead > 0 && <span className="text-emerald-500">↑{ahead}</span>}
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						<p className="text-xs">
							{behind > 0 && `Позади на ${behind}`}
							{behind > 0 && ahead > 0 && " · "}
							{ahead > 0 && `Впереди на ${ahead}`}
						</p>
					</TooltipContent>
				</Tooltip>
			)}

			{checksVisible && (
				<Tooltip delayDuration={400}>
					<TooltipTrigger asChild>
						<span
							className={cn(
								"flex items-center gap-0.5 font-mono text-[10px] tabular-nums leading-none",
								CHECKS_CONFIG[pr.checksStatus as keyof typeof CHECKS_CONFIG]
									.color,
							)}
						>
							{(() => {
								const Icon =
									CHECKS_CONFIG[pr.checksStatus as keyof typeof CHECKS_CONFIG]
										.icon;
								const spin =
									CHECKS_CONFIG[pr.checksStatus as keyof typeof CHECKS_CONFIG]
										.spin;
								return (
									<Icon
										className={cn("size-3", spin && "animate-spin")}
										strokeWidth={STROKE_WIDTH}
									/>
								);
							})()}
							{total > 0 && (
								<span>
									{passing}/{total}
								</span>
							)}
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						<p className="text-xs">
							{total > 0 ? `Проверки: ${passing} из ${total}` : "Проверки CI"}
						</p>
					</TooltipContent>
				</Tooltip>
			)}

			{pr && pr.state === "open" && (
				<Tooltip delayDuration={400}>
					<TooltipTrigger asChild>
						<span
							className={cn(
								"size-2 rounded-full shrink-0",
								REVIEW_CONFIG[pr.reviewDecision].dot,
							)}
							aria-hidden
						/>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						<p className="text-xs">
							Ревью: {REVIEW_CONFIG[pr.reviewDecision].label}
						</p>
					</TooltipContent>
				</Tooltip>
			)}

			{pr && (
				<Tooltip delayDuration={400}>
					<TooltipTrigger asChild>
						<span
							className={cn(
								"flex items-center gap-0.5 rounded-md px-1 py-0.5 leading-none",
								PR_STATE_CONFIG[pr.state].bg,
								isActive && "ring-1 ring-inset ring-border/40",
							)}
						>
							{(() => {
								const Icon = PR_STATE_CONFIG[pr.state].icon;
								return (
									<Icon
										className={cn("size-3", PR_STATE_CONFIG[pr.state].color)}
										strokeWidth={STROKE_WIDTH}
									/>
								);
							})()}
							<span className="font-mono text-[10px] tabular-nums text-muted-foreground leading-none">
								#{pr.number}
							</span>
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						<p className="text-xs">
							{PR_STATE_CONFIG[pr.state].label} · #{pr.number}
						</p>
					</TooltipContent>
				</Tooltip>
			)}
		</motion.div>
	);
}
