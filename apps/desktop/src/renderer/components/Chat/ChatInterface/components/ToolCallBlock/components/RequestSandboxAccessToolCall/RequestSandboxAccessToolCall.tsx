import { ToolCallRow } from "@rox/ui/ai-elements/tool-call-row";
import { AnimatePresence, motion } from "framer-motion";
import {
	CheckIcon,
	CircleXIcon,
	ClockIcon,
	FolderLockIcon,
	FolderOpenIcon,
	XIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useCallback } from "react";
import { motionSpring, useShouldAnimate } from "renderer/motion";
import type { ToolPart } from "../../../../utils/tool-helpers";
import type { ToolStatusBadgeVariant } from "../ToolStatusBadge";
import { ToolStatusBadge } from "../ToolStatusBadge";

interface RequestSandboxAccessToolCallProps {
	part: ToolPart;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
	isInterrupted?: boolean;
}

type AccessStatus = "pending" | "granted" | "denied" | "cancelled" | "error";

const ACCESS_STATUS_CONFIG: Record<
	AccessStatus,
	{
		icon: ComponentType<{ className?: string }>;
		label: string;
		variant?: ToolStatusBadgeVariant;
	}
> = {
	pending: { icon: ClockIcon, label: "Awaiting Response" },
	granted: { icon: CheckIcon, label: "Access Granted" },
	denied: { icon: XIcon, label: "Access Denied" },
	cancelled: { icon: XIcon, label: "Cancelled" },
	error: { icon: CircleXIcon, label: "Error", variant: "danger" },
};

/**
 * Stable wrapper passed as ToolCallRow's `icon`. Reads the live `status` and
 * renders the lock glyph with framer-motion: a restrained looping pulse while
 * pending, and a one-shot lock→unlock pop (FolderLock → FolderOpen) on grant.
 * Transform + opacity only; gated on the motion-preference foundation hook so
 * reduced-motion renders a static glyph (case 058).
 */
function SandboxAccessIcon({
	status,
	className,
}: {
	status: AccessStatus;
	className?: string;
}) {
	const shouldAnimate = useShouldAnimate("decorative");
	const isPending = status === "pending";
	const isGranted = status === "granted";

	return (
		<motion.span
			className="inline-flex"
			animate={
				shouldAnimate && isPending
					? { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }
					: { scale: 1, opacity: 1 }
			}
			transition={{
				duration: 1.4,
				repeat: shouldAnimate && isPending ? Number.POSITIVE_INFINITY : 0,
				ease: "easeInOut",
			}}
		>
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={isGranted ? "open" : "locked"}
					className="inline-flex"
					initial={{
						scale: shouldAnimate ? 0.8 : 1,
						opacity: shouldAnimate ? 0 : 1,
						rotate: shouldAnimate ? -8 : 0,
					}}
					animate={{ scale: 1, opacity: 1, rotate: 0 }}
					exit={{ opacity: 0, scale: 0.9 }}
					transition={shouldAnimate ? motionSpring.pop : { duration: 0 }}
				>
					{isGranted ? (
						<FolderOpenIcon className={className} />
					) : (
						<FolderLockIcon className={className} />
					)}
				</motion.span>
			</AnimatePresence>
		</motion.span>
	);
}

function toAccessDecision(content: string): "granted" | "denied" | null {
	if (content.startsWith("Access already granted")) return "granted";
	if (content.startsWith("Access granted")) return "granted";
	if (content.startsWith("Access denied")) return "denied";
	return null;
}

function toAccessStatus(
	part: ToolPart,
	result: Record<string, unknown>,
	isInterrupted: boolean,
): AccessStatus {
	if (
		isInterrupted &&
		part.state !== "output-available" &&
		part.state !== "output-error"
	) {
		return "cancelled";
	}
	if (part.state !== "output-available" && part.state !== "output-error") {
		return "pending";
	}
	if (part.state === "output-error" || result.isError === true) {
		return "error";
	}
	const content =
		(typeof result.content === "string" && result.content.trim()) ||
		(typeof result.text === "string" && result.text.trim()) ||
		"";
	return toAccessDecision(content) ?? "error";
}

export function RequestSandboxAccessToolCall({
	part,
	args,
	result,
	isInterrupted = false,
}: RequestSandboxAccessToolCallProps) {
	const requestedPath = typeof args.path === "string" ? args.path.trim() : null;
	const reason = typeof args.reason === "string" ? args.reason.trim() : null;

	const status = toAccessStatus(part, result, isInterrupted);
	const { icon, label, variant } = ACCESS_STATUS_CONFIG[status];
	const statusBadge = (
		<ToolStatusBadge icon={icon} label={label} variant={variant} />
	);

	// Stable wrapper so ToolCallRow keeps one mounted icon instance: swapping the
	// prop to an inline closure would remount each render and kill the pulse loop.
	const StatusIcon = useCallback(
		({ className }: { className?: string }) => (
			<SandboxAccessIcon status={status} className={className} />
		),
		[status],
	);

	const isPending = status === "pending";
	const isCancelledOrError = status === "cancelled" || status === "error";
	const hasContext = Boolean(requestedPath || reason);

	return (
		<ToolCallRow
			icon={StatusIcon}
			isPending={false}
			isError={false}
			title="Request Access"
			description={statusBadge}
		>
			{!isPending && hasContext ? (
				<div className="space-y-1 px-3 py-2">
					{requestedPath ? (
						<div className="text-xs text-muted-foreground">
							Path: {requestedPath}
						</div>
					) : null}
					{reason ? (
						<div className="text-xs text-muted-foreground">
							Reason: {reason}
						</div>
					) : null}
					{!isCancelledOrError ? (
						<div className="text-sm text-foreground">
							{status === "granted" ? "Access granted" : "Access denied"}
						</div>
					) : (
						<div className="flex items-center gap-1 text-sm text-destructive">
							<CircleXIcon className="h-3 w-3 shrink-0" />
							Aborted
						</div>
					)}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
