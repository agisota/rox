import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { VscGitPullRequest, VscLoading } from "react-icons/vsc";
import type { PRFlowDispatch } from "../../hooks/usePRFlowDispatch";
import { PRStatusGroup } from "./components/PRStatusGroup";
import {
	type PRFlowState,
	selectActionButton,
	type UnavailableReason,
} from "./utils/getPRFlowState";

interface PRActionHeaderProps {
	workspaceId: string;
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	onRetry?: () => void;
	/**
	 * Gates the "Create PR" entry point. When false, the no-PR state renders
	 * a muted icon with a tooltip instead of a clickable create button.
	 * Will flip to true once the chat-driven create flow lands in v2.
	 */
	createPREnabled?: boolean;
}

export function PRActionHeader({
	workspaceId,
	state,
	dispatch,
	onRetry,
	createPREnabled = true,
}: PRActionHeaderProps) {
	const action = selectActionButton(state);
	const animate = useShouldAnimate("decorative");

	// Key by state.kind for richer discrimination (loading|unavailable|no-pr|pr-exists|busy|error)
	const animKey = state.kind;

	const slot = (
		<ActionSlot
			variant={action}
			state={state}
			dispatch={dispatch}
			onRetry={onRetry}
			createPREnabled={createPREnabled}
			workspaceId={workspaceId}
			animate={animate}
		/>
	);

	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/45 px-2 dark:bg-muted/35">
			<div className="ml-auto flex items-center">
				{animate ? (
					<AnimatePresence mode="wait" initial={false}>
						<motion.div
							key={animKey}
							initial={{ opacity: 0, scale: 0.96, y: 2 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: -2 }}
							transition={{
								duration: motionDuration.fast,
								ease: ease.standard,
							}}
						>
							{slot}
						</motion.div>
					</AnimatePresence>
				) : (
					slot
				)}
			</div>
		</div>
	);
}

/**
 * Mirrors v1's PRButton state machine using just icons. PR-state, CI/review
 * detail, and copy all live in the hover card surfaced from PRStatusGroup —
 * the bar itself stays quiet at rest.
 */
function ActionSlot({
	variant,
	state,
	dispatch,
	onRetry,
	createPREnabled,
	workspaceId,
	animate,
}: {
	variant: ReturnType<typeof selectActionButton>;
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	onRetry?: () => void;
	createPREnabled: boolean;
	workspaceId: string;
	animate: boolean;
}) {
	switch (variant.kind) {
		case "hidden":
			// `pr-exists` lands here — render the link + indicators + dropdown.
			return (
				<PRStatusGroup
					state={state}
					workspaceId={workspaceId}
					onRefresh={onRetry}
				/>
			);

		case "disabled-tooltip":
			return <UnavailableIcon reason={variant.reasonKind} animate={animate} />;

		case "create-pr-dropdown":
			if (!createPREnabled) {
				return (
					<UnavailableIcon
						reason="create-disabled"
						tooltip="Create PR coming soon"
						animate={animate}
					/>
				);
			}
			return (
				<CreatePRIconButton
					state={state}
					dispatch={dispatch}
					animate={animate}
				/>
			);

		case "cancel-busy":
			return (
				<>
					<PRStatusGroup
						state={state}
						workspaceId={workspaceId}
						onRefresh={onRetry}
					/>
					<VscLoading className="ml-1.5 size-4 animate-spin text-muted-foreground" />
				</>
			);

		case "retry":
			return (
				<button
					type="button"
					onClick={onRetry}
					aria-label="Retry loading pull request"
					className="flex items-center text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					<motion.span
						layoutId={animate ? "pr-action-glyph" : undefined}
						className="flex"
					>
						<VscGitPullRequest className="size-4" />
					</motion.span>
				</button>
			);
	}
}

function UnavailableIcon({
	reason,
	tooltip,
	animate,
}: {
	reason: UnavailableReason | "create-disabled";
	tooltip?: string;
	animate: boolean;
}) {
	const tooltipText = tooltip ?? unavailableTooltip(reason);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex items-center text-muted-foreground/40">
					<motion.span
						layoutId={animate ? "pr-action-glyph" : undefined}
						className="flex"
					>
						<VscGitPullRequest className="size-4" />
					</motion.span>
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">{tooltipText}</TooltipContent>
		</Tooltip>
	);
}

function unavailableTooltip(
	reason: UnavailableReason | "create-disabled",
): string {
	switch (reason) {
		case "no-repo":
			return "No GitHub repository connected";
		case "default-branch":
			return "Switch to a feature branch to create a pull request";
		case "detached-head":
			return "Checkout a branch to create a pull request";
		case "create-disabled":
			return "Create PR coming soon";
	}
}

function CreatePRIconButton({
	state,
	dispatch,
	animate,
}: {
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	animate: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => dispatch({ state, draft: false })}
					aria-label="Create pull request"
					className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
				>
					<motion.span
						layoutId={animate ? "pr-action-glyph" : undefined}
						className="flex"
					>
						<VscGitPullRequest className="size-4" />
					</motion.span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">Create Pull Request</TooltipContent>
		</Tooltip>
	);
}
