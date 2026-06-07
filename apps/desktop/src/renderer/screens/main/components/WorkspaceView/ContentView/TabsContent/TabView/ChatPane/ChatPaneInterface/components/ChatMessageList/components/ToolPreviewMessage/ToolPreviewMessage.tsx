import { Message, MessageContent } from "@rox/ui/ai-elements/message";
import { AnimatePresence, motion } from "framer-motion";
import { ToolCallBlock } from "renderer/components/Chat/ChatInterface/components/ToolCallBlock";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import { motionSpring, useShouldAnimate } from "renderer/motion";
import type { ChatPendingPlanApproval } from "../../ChatMessageList.types";
import { PendingPlanApprovalMessage } from "../PendingPlanApprovalMessage";

interface ToolPreviewMessageProps {
	previewToolParts: ToolPart[];
	workspaceId: string;
	sessionId: string | null;
	organizationId: string | null;
	workspaceCwd?: string;
	pendingPlanApproval: ChatPendingPlanApproval;
	pendingPlanToolCallId: string | null;
	isPlanSubmitting: boolean;
	onPlanRespond: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
}

export function ToolPreviewMessage({
	previewToolParts,
	workspaceId,
	sessionId,
	organizationId,
	workspaceCwd,
	pendingPlanApproval,
	pendingPlanToolCallId,
	isPlanSubmitting,
	onPlanRespond,
}: ToolPreviewMessageProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	return (
		<Message from="assistant">
			<MessageContent>
				<div className="space-y-3">
					<AnimatePresence initial={false}>
						{previewToolParts.map((part) => {
							return (
								<motion.div
									key={`tool-preview-${part.toolCallId}`}
									layout
									className="space-y-3"
									initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
									animate={{ opacity: 1, y: 0 }}
									exit={shouldAnimate ? { opacity: 0, y: -4 } : { opacity: 0 }}
									transition={
										shouldAnimate ? motionSpring.soft : { duration: 0 }
									}
								>
									<ToolCallBlock
										part={part}
										workspaceId={workspaceId}
										sessionId={sessionId}
										organizationId={organizationId}
										workspaceCwd={workspaceCwd}
									/>
									{pendingPlanApproval &&
									pendingPlanToolCallId &&
									pendingPlanToolCallId === part.toolCallId ? (
										<PendingPlanApprovalMessage
											inline
											planApproval={pendingPlanApproval}
											isSubmitting={isPlanSubmitting}
											onRespond={onPlanRespond}
										/>
									) : null}
								</motion.div>
							);
						})}
					</AnimatePresence>
				</div>
			</MessageContent>
		</Message>
	);
}
