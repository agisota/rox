import type { UseChatDisplayReturn } from "@rox/chat/client";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@rox/ui/ai-elements/message";
import { Button } from "@rox/ui/button";
import { Switch } from "@rox/ui/switch";
import { Textarea } from "@rox/ui/textarea";
import { motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { useShouldAnimate } from "renderer/motion";
import { ease, motionDuration, motionSpring } from "renderer/motion/tokens";

type PendingPlanApproval = UseChatDisplayReturn["pendingPlanApproval"];

interface PendingPlanApprovalMessageProps {
	planApproval: PendingPlanApproval;
	isSubmitting: boolean;
	inline?: boolean;
	onRespond: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
}

export function PendingPlanApprovalMessage({
	planApproval,
	isSubmitting,
	inline = false,
	onRespond,
}: PendingPlanApprovalMessageProps) {
	const [feedback, setFeedback] = useState("");
	const [selectedAction, setSelectedAction] = useState<
		"approved" | "rejected" | null
	>(null);
	const [renderMarkdown, setRenderMarkdown] = useState(true);
	const [resolvedPlanId, setResolvedPlanId] = useState<string | null>(null);
	const inFlightResponseRef = useRef(false);
	const previousPlanIdRef = useRef<string | null>(null);
	const feedbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);
	const markdownToggleId = useId();

	useEffect(() => {
		const currentPlanId = planApproval?.planId ?? null;
		if (previousPlanIdRef.current === currentPlanId) return;
		previousPlanIdRef.current = currentPlanId;
		setFeedback("");
		setSelectedAction(null);
		setRenderMarkdown(true);
		setResolvedPlanId(null);
	}, [planApproval]);

	const shouldAnimate = useShouldAnimate("decorative");

	if (!planApproval) return null;

	const planId = planApproval.planId?.trim() ?? "";
	if (resolvedPlanId && resolvedPlanId === planId) return null;
	const title = planApproval.title?.trim() || "Implementation plan";
	const planBody =
		planApproval.plan?.trim() || "No plan details were provided.";
	const canRespond = planId.length > 0;
	const getLatestFeedback = (): string => {
		const textareaValue = feedbackTextareaRef.current?.value;
		return (textareaValue ?? feedback).trim();
	};
	const handleRespond = async (
		action: "approved" | "rejected",
	): Promise<void> => {
		if (!canRespond || isSubmitting || inFlightResponseRef.current) return;
		inFlightResponseRef.current = true;
		setSelectedAction(action);
		const latestFeedback = getLatestFeedback();
		try {
			await onRespond({
				action,
				...(latestFeedback ? { feedback: latestFeedback } : {}),
			});
			setResolvedPlanId(planId);
		} catch (error) {
			console.error("Failed to submit plan approval response", error);
			setSelectedAction(null);
		} finally {
			inFlightResponseRef.current = false;
		}
	};

	const content = (
		<motion.div
			className="w-full max-w-none space-y-3 rounded-xl border bg-card/95 p-3"
			initial={shouldAnimate ? { opacity: 0, y: 8, scale: 0.98 } : false}
			animate={shouldAnimate ? { opacity: 1, y: 0, scale: 1 } : undefined}
			transition={motionSpring.soft}
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="text-sm text-foreground">{title}</div>
				<label
					htmlFor={markdownToggleId}
					className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
				>
					<Switch
						id={markdownToggleId}
						checked={renderMarkdown}
						onCheckedChange={setRenderMarkdown}
						disabled={isSubmitting}
					/>
					Render markdown
				</label>
			</div>
			<div className="rounded-md border bg-muted/20 p-3">
				{renderMarkdown ? (
					<div className="max-h-[32rem] overflow-auto">
						<MessageResponse
							animated={false}
							isAnimating={false}
							mermaid={{
								config: {
									theme: "default",
								},
							}}
						>
							{planBody}
						</MessageResponse>
					</div>
				) : (
					<pre className="max-h-[32rem] overflow-auto text-sm whitespace-pre-wrap break-words">
						{planBody}
					</pre>
				)}
			</div>
			<div className="space-y-2">
				<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Feedback (optional)
				</div>
				<Textarea
					ref={feedbackTextareaRef}
					value={feedback}
					onChange={(event) => setFeedback(event.target.value)}
					placeholder="Добавьте замечания для доработки..."
					disabled={isSubmitting || !canRespond}
					rows={4}
				/>
				<div className="text-xs text-muted-foreground">
					Feedback is included with your response.
				</div>
			</div>
			<div className="flex flex-wrap items-center justify-end gap-2">
				<motion.span
					className="inline-flex"
					whileHover={shouldAnimate ? { scale: 1.02 } : undefined}
					whileTap={shouldAnimate ? { scale: 0.96 } : undefined}
					animate={
						shouldAnimate && selectedAction === "rejected"
							? { scale: [1, 1.06, 1] }
							: undefined
					}
					transition={{ duration: motionDuration.slow, ease: ease.standard }}
				>
					<Button
						type="button"
						variant="outline"
						className={
							selectedAction === "rejected"
								? "border-destructive text-destructive"
								: ""
						}
						disabled={isSubmitting || !canRespond}
						onClick={() => {
							void handleRespond("rejected");
						}}
					>
						Request changes
					</Button>
				</motion.span>
				<motion.span
					className="inline-flex"
					whileHover={shouldAnimate ? { scale: 1.02 } : undefined}
					whileTap={shouldAnimate ? { scale: 0.96 } : undefined}
					animate={
						shouldAnimate && selectedAction === "approved"
							? { scale: [1, 1.06, 1] }
							: undefined
					}
					transition={{ duration: motionDuration.slow, ease: ease.standard }}
				>
					<Button
						type="button"
						className={
							selectedAction === "approved"
								? "border-primary bg-primary/10 text-primary"
								: ""
						}
						disabled={isSubmitting || !canRespond}
						onClick={() => {
							void handleRespond("approved");
						}}
					>
						Approve plan
					</Button>
				</motion.span>
			</div>
		</motion.div>
	);

	if (inline) return content;

	return (
		<Message from="assistant">
			<MessageContent>{content}</MessageContent>
		</Message>
	);
}
