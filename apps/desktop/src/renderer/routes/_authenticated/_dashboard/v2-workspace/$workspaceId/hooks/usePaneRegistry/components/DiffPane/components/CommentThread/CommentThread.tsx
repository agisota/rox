import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Button } from "@rox/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@rox/ui/collapsible";
import {
	AnimatedHeight,
	motionDuration,
	useShouldAnimate,
} from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { workspaceTrpc } from "@rox/workspace-client";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
	LuCheck,
	LuChevronRight,
	LuCopy,
	LuExternalLink,
	LuLoaderCircle,
} from "react-icons/lu";
import { CommentMarkdown } from "renderer/components/CommentMarkdown";
import "./comment-thread.css";

interface Comment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: number;
}

interface CommentThreadProps {
	workspaceId: string;
	threadId: string;
	isResolved: boolean;
	isOutdated?: boolean;
	url?: string;
	comments: Comment[];
	/** Force-expand the bubble whenever this changes — lets jump-to-line
	 *  reveal a collapsed (resolved/outdated) thread. */
	focusTick?: number;
}

export function CommentThread({
	workspaceId,
	threadId,
	isResolved,
	isOutdated,
	url,
	comments,
	focusTick,
}: CommentThreadProps) {
	const [open, setOpen] = useState(!isResolved && !isOutdated);
	const [isCopied, setIsCopied] = useState(false);
	const shouldAnimate = useShouldAnimate("decorative");
	const pulse = useAnimationControls();
	const focusedOnce = useRef(false);
	useEffect(() => {
		if (!isCopied) return;
		const timer = setTimeout(() => setIsCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [isCopied]);
	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation();
		const text =
			comments.length === 1
				? comments[0].body
				: comments.map((c) => `@${c.authorLogin}:\n${c.body}`).join("\n\n");
		navigator.clipboard
			.writeText(text)
			.then(() => setIsCopied(true))
			.catch((err) => {
				console.error("[CommentThread/copy] Failed to copy:", err);
				toast.error("Couldn't copy comment");
			});
	};
	// Auto-collapse on resolve/outdated (matches GitHub).
	useEffect(() => {
		if (isResolved || isOutdated) setOpen(false);
	}, [isResolved, isOutdated]);
	// Force-expand when the reviewer jumps to this line, even if it was
	// collapsed for being resolved or outdated. Also fires a ring/bg pulse
	// so the focused thread is visually obvious.
	useEffect(() => {
		if (focusTick == null) return;
		setOpen(true);
		// Skip a spurious pulse if the thread mounts already focused (list remount/scroll-restore).
		if (!focusedOnce.current) {
			focusedOnce.current = true;
			return;
		}
		if (!shouldAnimate) return;
		void pulse.start({
			opacity: [0, 1, 0],
			transition: { duration: 0.9, ease: "easeOut", times: [0, 0.12, 1] },
		});
	}, [focusTick, shouldAnimate, pulse]);
	const utils = workspaceTrpc.useUtils();
	const setResolution = workspaceTrpc.git.setReviewThreadResolution.useMutation(
		{
			onSuccess: () => {
				void utils.git.getPullRequestThreads.invalidate({ workspaceId });
			},
			onError: (error) => {
				toast.error("Couldn't update thread", {
					description: error.message,
				});
			},
		},
	);

	const isDimmed = isResolved || isOutdated;

	return (
		<motion.div
			initial={false}
			animate={shouldAnimate ? { opacity: isDimmed ? 0.7 : 1 } : {}}
			transition={{ duration: motionDuration.base }}
		>
			<Collapsible
				open={open}
				onOpenChange={setOpen}
				className={cn(
					"diff-comment relative mx-3 my-1 overflow-hidden rounded-md border border-border bg-card text-card-foreground",
					!shouldAnimate && isResolved && "opacity-70",
				)}
			>
				<motion.div
					aria-hidden
					className="pointer-events-none absolute inset-0 z-10 rounded-md bg-primary/10 ring-2 ring-primary/60"
					initial={{ opacity: 0 }}
					animate={pulse}
					style={{ opacity: 0 }}
				/>
				<div className="flex items-center gap-2 px-2.5 py-1.5">
					<CollapsibleTrigger
						className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none"
						aria-label={open ? "Collapse thread" : "Expand thread"}
					>
						<LuChevronRight
							className={cn(
								"size-3 shrink-0 transition-transform",
								open && "rotate-90",
							)}
						/>
						<span className="shrink-0">
							{comments.length === 1
								? "1 comment"
								: `${comments.length} comments`}
						</span>
						{shouldAnimate ? (
							<AnimatePresence initial={false}>
								{isOutdated && (
									<motion.span
										key="outdated"
										initial={{ opacity: 0, scale: 0.85 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.85 }}
										transition={{ duration: motionDuration.fast }}
										className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide"
									>
										Outdated
									</motion.span>
								)}
								{isResolved && (
									<motion.span
										key="resolved"
										initial={{ opacity: 0, scale: 0.85 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.85 }}
										transition={{ duration: motionDuration.fast }}
										className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide"
									>
										Resolved
									</motion.span>
								)}
							</AnimatePresence>
						) : (
							<>
								{isOutdated && (
									<span className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide">
										Outdated
									</span>
								)}
								{isResolved && (
									<span className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide">
										Resolved
									</span>
								)}
							</>
						)}
					</CollapsibleTrigger>
					<button
						type="button"
						onClick={handleCopy}
						className="shrink-0 text-muted-foreground hover:text-foreground"
						aria-label={
							isCopied
								? "Copied"
								: comments.length === 1
									? "Copy comment"
									: "Copy comments"
						}
					>
						{isCopied ? (
							<LuCheck className="size-3 text-green-500" />
						) : (
							<LuCopy className="size-3" />
						)}
					</button>
					{url && (
						<a
							href={url}
							target="_blank"
							rel="noreferrer"
							onClick={(e) => e.stopPropagation()}
							className="shrink-0 text-muted-foreground hover:text-foreground"
							aria-label="Open on GitHub"
						>
							<LuExternalLink className="size-3" />
						</a>
					)}
				</div>
				<CollapsibleContent className="overflow-hidden" forceMount>
					<AnimatedHeight open={open}>
						<ul className="divide-y divide-border border-t border-border">
							{comments.map((comment) => (
								<CommentRow key={comment.id} comment={comment} />
							))}
						</ul>
						<div className="flex items-center justify-end border-t border-border bg-muted/30 px-2.5 py-1.5">
							<Button
								type="button"
								size="xs"
								variant="outline"
								disabled={setResolution.isPending}
								onClick={() =>
									setResolution.mutate({
										workspaceId,
										threadId,
										resolved: !isResolved,
									})
								}
							>
								{setResolution.isPending && (
									<LuLoaderCircle className="size-3 animate-spin" />
								)}
								{isResolved ? "Unresolve" : "Resolve conversation"}
							</Button>
						</div>
					</AnimatedHeight>
				</CollapsibleContent>
			</Collapsible>
		</motion.div>
	);
}

function CommentRow({ comment }: { comment: Comment }) {
	return (
		<li className="flex gap-2 px-2.5 py-2">
			<Avatar className="mt-0.5 size-5 shrink-0">
				{comment.avatarUrl ? (
					<AvatarImage src={comment.avatarUrl} alt={comment.authorLogin} />
				) : null}
				<AvatarFallback className="text-[10px]">
					{comment.authorLogin.slice(0, 1).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2 text-xs">
					<span className="font-medium text-foreground">
						{comment.authorLogin}
					</span>
					{comment.createdAt != null && (
						<time
							className="text-muted-foreground"
							dateTime={new Date(comment.createdAt).toISOString()}
						>
							{formatRelative(comment.createdAt)}
						</time>
					)}
				</div>
				<div className="diff-comment-body mt-1">
					<CommentMarkdown body={comment.body} />
				</div>
			</div>
		</li>
	);
}

function formatRelative(ms: number): string {
	// Floor (not round) so a 30-minute comment doesn't read "1h ago".
	// Clamp >=0 so future-dated timestamps from clock skew aren't negative.
	const delta = Math.max(0, Date.now() - ms);
	const seconds = Math.floor(delta / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	const years = Math.floor(days / 365);
	return `${years}y ago`;
}
