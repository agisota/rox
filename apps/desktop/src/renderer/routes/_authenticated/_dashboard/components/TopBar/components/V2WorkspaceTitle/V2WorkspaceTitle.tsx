import { motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { OverflowFadeText } from "@rox/ui/overflow-fade-text";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, GitBranch } from "lucide-react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface V2WorkspaceTitleProps {
	workspaceId: string;
}

export function V2WorkspaceTitle({ workspaceId }: V2WorkspaceTitleProps) {
	const collections = useCollections();
	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, workspaceId))
				.select(({ workspaces }) => ({
					name: workspaces.name,
					branch: workspaces.branch,
				})),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;
	const name = workspace?.name ?? null;
	const branch = workspace?.branch ?? null;
	const animate = useShouldAnimate("essential");

	if (!name && !branch) {
		return null;
	}

	return (
		<div className="flex min-w-0 max-w-full items-center gap-1.5 text-[13px] tracking-tight">
			{name && (
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={name}
						initial={animate ? { opacity: 0, y: 2 } : false}
						animate={{ opacity: 1, y: 0 }}
						exit={animate ? { opacity: 0, y: -2 } : { opacity: 0 }}
						transition={{ duration: motionDuration.fast }}
						className="min-w-0"
					>
						<OverflowFadeText
							className="font-medium text-foreground"
							title={name}
						>
							{name}
						</OverflowFadeText>
					</motion.span>
				</AnimatePresence>
			)}
			{name && branch && (
				<ChevronRight
					className="size-3 shrink-0 text-muted-foreground/40"
					strokeWidth={2}
					aria-hidden="true"
				/>
			)}
			{branch && (
				<span
					className="flex min-w-0 items-center gap-1 text-muted-foreground"
					title={branch}
				>
					<GitBranch
						className="size-3 shrink-0 opacity-70"
						strokeWidth={2}
						aria-hidden="true"
					/>
					<OverflowFadeText>{branch}</OverflowFadeText>
				</span>
			)}
		</div>
	);
}
