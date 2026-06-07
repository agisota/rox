import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	useEffect,
	useRef,
	useState,
} from "react";
import { HiMiniMinus, HiMiniXMark } from "react-icons/hi2";
import { LuStar } from "react-icons/lu";
import type { DiffStats } from "renderer/hooks/host-service/useDiffStats";
import { HotkeyLabel } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	ease,
	motionDuration,
	motionSpring,
	PopIn,
	useShouldAnimate,
} from "renderer/motion";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspacePullRequest,
} from "../../../../types";
import { DashboardSidebarWorkspaceDiffStats } from "../DashboardSidebarWorkspaceDiffStats";
import { DashboardSidebarWorkspaceIcon } from "../DashboardSidebarWorkspaceIcon";

const PR_STATE_LABEL: Record<
	DashboardSidebarWorkspacePullRequest["state"],
	string
> = {
	open: "Open",
	merged: "Merged",
	closed: "Closed",
	draft: "Draft",
};

interface DashboardSidebarExpandedWorkspaceRowProps
	extends ComponentPropsWithoutRef<"div"> {
	workspace: DashboardSidebarWorkspace;
	isActive: boolean;
	isRenaming: boolean;
	renameValue: string;
	shortcutLabel?: string;
	diffStats: DiffStats | null;
	workspaceStatus?: ActivePaneStatus | null;
	isInSection?: boolean;
	isPinned?: boolean;
	onToggleFavoriteClick?: () => void;
	onClick?: () => void;
	onDoubleClick?: () => void;
	onCloseWorkspaceClick: () => void;
	onRemoveFromSidebarClick: () => void;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
}

export const DashboardSidebarExpandedWorkspaceRow = forwardRef<
	HTMLDivElement,
	DashboardSidebarExpandedWorkspaceRowProps
>(
	(
		{
			workspace,
			isActive,
			isRenaming,
			renameValue,
			shortcutLabel,
			diffStats,
			workspaceStatus = null,
			isInSection = false,
			isPinned = false,
			onToggleFavoriteClick,
			onClick,
			onDoubleClick,
			onCloseWorkspaceClick,
			onRemoveFromSidebarClick,
			onRenameValueChange,
			onSubmitRename,
			onCancelRename,
			className,
			...props
		},
		ref,
	) => {
		const {
			accentColor = null,
			hostType,
			hostIsOnline,
			name,
			branch,
			pullRequest,
			pendingTransaction,
		} = workspace;
		const isPending = pendingTransaction?.type === "insert";
		const showsStandaloneActiveStripe = accentColor == null;
		const animate = useShouldAnimate("essential");
		const animateMorph = useShouldAnimate("decorative");
		const [revealed, setRevealed] = useState(false);
		const localRef = useRef<HTMLDivElement>(null);
		const openUrl = electronTrpc.external.openUrl.useMutation();

		// One-shot "go-live" flash when the row morphs from pending → live.
		const wasPending = useRef(isPending);
		const [justWentLive, setJustWentLive] = useState(false);
		useEffect(() => {
			if (wasPending.current && !isPending && animateMorph) {
				setJustWentLive(true);
				const timeout = setTimeout(() => setJustWentLive(false), 600);
				wasPending.current = isPending;
				return () => clearTimeout(timeout);
			}
			wasPending.current = isPending;
		}, [isPending, animateMorph]);

		useEffect(() => {
			if (isActive) {
				localRef.current?.scrollIntoView({
					block: "nearest",
					behavior: "smooth",
				});
			}
		}, [isActive]);

		const creationStatusText = isPending ? "Creating…" : null;
		const isMainWorkspace = workspace.type === "main";
		const workspaceKindTitle = isMainWorkspace
			? "Main workspace"
			: "Worktree workspace";
		const workspaceKindDescription = isMainWorkspace
			? "Uses the repository checkout on this host"
			: "Isolated copy for parallel development";

		const quickActions = (
			<>
				{shortcutLabel && (
					<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
						{shortcutLabel}
					</span>
				)}
				{onToggleFavoriteClick && (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onToggleFavoriteClick();
								}}
								onKeyDown={(event) => {
									if (
										event.key === "Enter" ||
										event.key === " " ||
										event.key === "Spacebar"
									) {
										event.stopPropagation();
									}
								}}
								className="flex items-center justify-center text-muted-foreground hover:text-foreground"
								aria-label={isPinned ? "Unpin workspace" : "Pin workspace"}
								aria-pressed={isPinned}
							>
								<PopIn active={isPinned}>
									<LuStar
										className={cn(
											"size-3.5",
											isPinned && "fill-current text-amber-400",
										)}
									/>
								</PopIn>
							</button>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={4}>
							{isPinned ? "Unpin workspace" : "Pin workspace"}
						</TooltipContent>
					</Tooltip>
				)}
				{isMainWorkspace ? (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onRemoveFromSidebarClick();
								}}
								onKeyDown={(event) => {
									if (
										event.key === "Enter" ||
										event.key === " " ||
										event.key === "Spacebar"
									) {
										event.stopPropagation();
									}
								}}
								className="flex items-center justify-center text-muted-foreground hover:text-foreground"
								aria-label="Remove from sidebar"
							>
								<HiMiniMinus className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={4}>
							<HotkeyLabel label="Remove from sidebar" />
						</TooltipContent>
					</Tooltip>
				) : (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onCloseWorkspaceClick();
								}}
								onKeyDown={(event) => {
									if (
										event.key === "Enter" ||
										event.key === " " ||
										event.key === "Spacebar"
									) {
										event.stopPropagation();
									}
								}}
								className="flex items-center justify-center text-muted-foreground hover:text-foreground"
								aria-label="Close workspace"
							>
								<HiMiniXMark className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={4}>
							<HotkeyLabel
								label="Close workspace"
								id={isActive ? "CLOSE_WORKSPACE" : undefined}
							/>
						</TooltipContent>
					</Tooltip>
				)}
			</>
		);

		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: Mirrors the legacy sidebar row UI, which includes nested action buttons.
			<div
				role={onClick ? "button" : undefined}
				tabIndex={onClick ? 0 : undefined}
				aria-disabled={isPending ? true : undefined}
				ref={(node) => {
					localRef.current = node;
					if (typeof ref === "function") ref(node);
					else if (ref) ref.current = node;
				}}
				onClick={onClick}
				onKeyDown={(event) => {
					if (onClick && (event.key === "Enter" || event.key === " ")) {
						event.preventDefault();
						onClick();
					}
				}}
				onDoubleClick={onDoubleClick}
				onMouseEnter={() => setRevealed(true)}
				onMouseLeave={() => setRevealed(false)}
				onFocus={() => setRevealed(true)}
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node)) {
						setRevealed(false);
					}
				}}
				className={cn(
					"relative flex w-full items-center pr-2 text-left text-sm",
					isInSection ? "pl-7" : "pl-5",
					onClick &&
						(isActive
							? "cursor-pointer hover:bg-muted"
							: "cursor-pointer hover:bg-muted/50"),
					"group",
					"py-2",
					isActive && "bg-muted",
					className,
				)}
				{...props}
			>
				{animateMorph && justWentLive && (
					<motion.div
						aria-hidden
						className="pointer-events-none absolute inset-0 bg-foreground/10"
						initial={{ opacity: 0 }}
						animate={{ opacity: [0, 0.35, 0] }}
						transition={{ duration: 0.6, ease: ease.standard }}
					/>
				)}

				{isActive &&
					showsStandaloneActiveStripe &&
					(animate ? (
						<motion.div
							layoutId="dashboard-sidebar-active-rail"
							className="absolute top-0 bottom-0 left-0 w-0.5 rounded-r"
							style={{ backgroundColor: "var(--color-foreground)" }}
							transition={motionSpring.snappy}
						/>
					) : (
						<div
							className="absolute top-0 bottom-0 left-0 w-0.5 rounded-r"
							style={{ backgroundColor: "var(--color-foreground)" }}
						/>
					))}

				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						{pullRequest ? (
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									openUrl.mutate(pullRequest.url);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.stopPropagation();
									}
								}}
								aria-label={`Open pull request #${pullRequest.number}`}
								className="relative mr-2.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-foreground/10"
							>
								<DashboardSidebarWorkspaceIcon
									hostType={hostType}
									workspaceType={workspace.type}
									hostIsOnline={hostIsOnline}
									isActive={isActive}
									variant="expanded"
									workspaceStatus={workspaceStatus}
									isCreatePending={isPending}
									pullRequestState={pullRequest.state}
								/>
							</button>
						) : (
							<div className="relative mr-2.5 flex size-5 shrink-0 items-center justify-center">
								<DashboardSidebarWorkspaceIcon
									hostType={hostType}
									workspaceType={workspace.type}
									hostIsOnline={hostIsOnline}
									isActive={isActive}
									variant="expanded"
									workspaceStatus={workspaceStatus}
									isCreatePending={isPending}
									pullRequestState={null}
								/>
							</div>
						)}
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={8}>
						{pullRequest ? (
							<>
								<p className="text-xs font-medium">
									PR #{pullRequest.number} — {PR_STATE_LABEL[pullRequest.state]}
								</p>
								<p className="text-xs text-muted-foreground">
									Click to open on GitHub
								</p>
							</>
						) : (
							<>
								<p className="text-xs font-medium">
									{isMainWorkspace
										? workspaceKindTitle
										: hostType === "local-device"
											? "Local workspace"
											: hostType === "remote-device"
												? hostIsOnline === false
													? "Remote workspace — device offline"
													: "Remote workspace"
												: "Cloud workspace"}
								</p>
								<p className="text-xs text-muted-foreground">
									{isMainWorkspace
										? workspaceKindDescription
										: hostType === "local-device"
											? "Running on this device"
											: hostType === "remote-device"
												? hostIsOnline === false
													? "The associated device isn't reachable right now"
													: "Running on a paired device"
												: "Hosted in the cloud"}
								</p>
							</>
						)}
					</TooltipContent>
				</Tooltip>

				<div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5">
					{isRenaming ? (
						<RenameInput
							value={renameValue}
							onChange={onRenameValueChange}
							onSubmit={onSubmitRename}
							onCancel={onCancelRename}
							className={cn(
								"h-5 w-full -ml-1 border-none bg-transparent px-1 py-0 text-[13px] leading-tight outline-none",
							)}
						/>
					) : (
						<span
							className={cn(
								"truncate text-[13px] leading-tight transition-colors",
								isActive ? "text-foreground" : "text-foreground/80",
							)}
						>
							{name || branch}
						</span>
					)}

					<div className="col-start-2 row-start-1 grid h-5 shrink-0 items-center justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
						<AnimatePresence initial={false} mode="popLayout">
							{creationStatusText ? (
								<motion.span
									key="creating"
									className="text-[11px] text-muted-foreground"
									initial={{ opacity: 0, y: animateMorph ? 2 : 0 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: animateMorph ? -2 : 0 }}
									transition={{
										duration: animateMorph ? motionDuration.fast : 0,
										ease: ease.standard,
									}}
								>
									{creationStatusText}
								</motion.span>
							) : (
								diffStats &&
								(diffStats.additions > 0 || diffStats.deletions > 0) && (
									<motion.div
										key="stats"
										initial={{ opacity: 0, y: animateMorph ? 2 : 0 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: animateMorph ? -2 : 0 }}
										transition={{
											duration: animateMorph ? motionDuration.fast : 0,
											ease: ease.standard,
										}}
									>
										<DashboardSidebarWorkspaceDiffStats
											additions={diffStats.additions}
											deletions={diffStats.deletions}
											isActive={isActive}
										/>
									</motion.div>
								)
							)}
						</AnimatePresence>
						{!isPending &&
							(animateMorph ? (
								<motion.div
									className="flex items-center justify-end gap-1.5 overflow-hidden"
									initial={false}
									animate={{
										opacity: revealed ? 1 : 0,
										width: revealed ? "auto" : 0,
									}}
									transition={{
										duration: motionDuration.fast,
										ease: ease.standard,
									}}
									aria-hidden={revealed ? undefined : true}
								>
									{quickActions}
								</motion.div>
							) : (
								<div className="hidden items-center justify-end gap-1.5 group-hover:flex">
									{quickActions}
								</div>
							))}
					</div>
				</div>
			</div>
		);
	},
);
