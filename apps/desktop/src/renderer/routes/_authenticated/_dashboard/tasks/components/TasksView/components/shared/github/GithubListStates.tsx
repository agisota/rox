import { Button } from "@rox/ui/button";
import { motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { Skeleton } from "@rox/ui/skeleton";
import { cn } from "@rox/ui/utils";
import { motion } from "framer-motion";
import type { ComponentType } from "react";
import { LuExternalLink, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import type { GithubFetchError } from "./types";

const SKELETON_COUNT = 7;

/**
 * Glass shimmer skeleton rows. Replaces the old spinner-only loading state so
 * all three panes share one loading affordance. The shimmer is a CSS keyframe
 * (`animate-pulse` on `bg-accent` from the @rox/ui Skeleton) — no JS loop.
 */
export function GithubSkeletonRows() {
	return (
		<div className="flex flex-col">
			{Array.from({ length: SKELETON_COUNT }).map((_, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static skeleton, order never changes
					key={i}
					className="flex items-center gap-3 px-4 h-11 border-b border-border/40"
				>
					<Skeleton className="size-4 shrink-0 rounded-full" />
					<Skeleton className="h-3 w-10 shrink-0" />
					<Skeleton className="h-3.5 flex-1 max-w-[42%]" />
					<Skeleton className="ml-auto h-3 w-16 shrink-0" />
					<Skeleton className="h-3 w-12 shrink-0" />
				</div>
			))}
		</div>
	);
}

interface GithubEmptyStateProps {
	icon: ComponentType<{ className?: string }>;
	message: string;
}

/** Small centered glass card for the "no rows" state. */
export function GithubEmptyState({
	icon: Icon,
	message,
}: GithubEmptyStateProps) {
	const animate = useShouldAnimate("decorative");
	return (
		<div className="flex h-full items-center justify-center p-8">
			<motion.div
				className="flex flex-col items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-8 py-7 text-center backdrop-blur-xl"
				initial={animate ? { opacity: 0, scale: 0.96 } : false}
				animate={{ opacity: 1, scale: 1 }}
				transition={motionSpring.bouncy}
			>
				<Icon className="size-7 text-muted-foreground" />
				<span className="text-sm text-muted-foreground">{message}</span>
			</motion.div>
		</div>
	);
}

interface GithubNoProjectStateProps {
	icon: ComponentType<{ className?: string }>;
	message: string;
}

/**
 * Shown when no project is selected. The icon pulses to draw the eye toward the
 * ProjectFilter in the top bar (per spec: "make ProjectFilter pulse").
 */
export function GithubNoProjectState({
	icon: Icon,
	message,
}: GithubNoProjectStateProps) {
	const animate = useShouldAnimate("decorative");
	return (
		<div className="flex h-full items-center justify-center p-8">
			<div className="flex flex-col items-center gap-2.5 text-center text-muted-foreground">
				<motion.span
					animate={animate ? { opacity: [0.4, 1, 0.4] } : undefined}
					transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY }}
				>
					<Icon className="size-8" />
				</motion.span>
				<span className="text-sm">{message}</span>
			</div>
		</div>
	);
}

interface GithubErrorCardProps {
	error: GithubFetchError;
	/** Forces a refetch (bypasses retry:false). */
	onRetry: () => void;
	/** Repo URL fallback for "Открыть в GitHub", when known. */
	githubUrl?: string | null;
}

/**
 * The resilient error card. Replaces the recon-flagged silent "error text"
 * line: shows the classified RU remediation, a "Повторить" manual-retry button,
 * and an "Открыть в GitHub" fallback. The raw message stays selectable.
 */
export function GithubErrorCard({
	error,
	onRetry,
	githubUrl,
}: GithubErrorCardProps) {
	const animate = useShouldAnimate("decorative");
	return (
		<div className="flex h-full items-center justify-center p-8">
			<motion.div
				className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-8 py-7 text-center backdrop-blur-xl"
				initial={animate ? { opacity: 0, scale: 0.96 } : false}
				animate={{ opacity: 1, scale: 1 }}
				transition={motionSpring.bouncy}
			>
				<LuTriangleAlert className="size-7 text-destructive" />
				<span className="text-sm font-medium text-foreground">
					{error.message}
				</span>
				{error.kind === "unknown" ? null : (
					<span className="select-text cursor-text text-xs text-muted-foreground">
						{error.raw}
					</span>
				)}
				<div className="mt-1 flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="h-8 gap-1.5"
						onClick={onRetry}
					>
						<LuRefreshCw className="size-3.5" />
						Повторить
					</Button>
					{githubUrl && (
						<Button
							variant="ghost"
							size="sm"
							className="h-8 gap-1.5"
							onClick={() =>
								window.open(githubUrl, "_blank", "noopener,noreferrer")
							}
						>
							<LuExternalLink className="size-3.5" />
							Открыть в GitHub
						</Button>
					)}
				</div>
			</motion.div>
		</div>
	);
}

interface RepoMismatchBannerProps {
	repo: string;
	kind: "pr" | "issue";
}

/** Amber glass inline warning replacing the old plain muted text. */
export function RepoMismatchBanner({ repo, kind }: RepoMismatchBannerProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 px-4 py-2 text-xs",
				"border-b border-amber-500/30 bg-amber-500/10 text-amber-200",
			)}
		>
			<LuTriangleAlert className="size-3.5 shrink-0" />
			<span className="select-text cursor-text">
				URL {kind === "pr" ? "PR" : "Issue"} должен совпадать с{" "}
				<span className="font-mono">{repo}</span>.
			</span>
		</div>
	);
}
