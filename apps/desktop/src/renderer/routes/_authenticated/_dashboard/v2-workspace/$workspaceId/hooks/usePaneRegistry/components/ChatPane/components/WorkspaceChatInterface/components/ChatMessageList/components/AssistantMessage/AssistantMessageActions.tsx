import {
	MessageAction,
	MessageActions,
	messageActionLabels,
} from "@rox/ui/ai-elements/message";
import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { ListenButton, type SynthesizedAudio } from "@rox/ui/voice";
import { motion } from "framer-motion";
import {
	CheckIcon,
	CopyIcon,
	RefreshCwIcon,
	RotateCcwIcon,
} from "lucide-react";
import { useState } from "react";

interface AssistantMessageActionsProps {
	actionDisabled: boolean;
	copied: boolean;
	fullText: string;
	canRetry: boolean;
	onCopy: () => void;
	onRegenerate: () => void;
	onRetry: () => void;
	/**
	 * FN-043 (#486): synthesize the reply to speech for the "Прослушать" button.
	 * Wired by the desktop edge to edge-TTS over tRPC; omitted → button hidden.
	 */
	onSynthesize?: (text: string) => Promise<SynthesizedAudio>;
	/** Surfaces a synthesis/playback failure (e.g. a toast). */
	onListenError?: (error: unknown) => void;
}

/**
 * F43: assistant-message action row (copy / regenerate / retry). Mirrors
 * `UserMessageActions` styling and reuses the shared RU labels so affordances
 * stay consistent across surfaces. Regenerate/retry re-run the turn through the
 * same `session.sendMessage` path the user-message resend uses.
 */
export function AssistantMessageActions({
	actionDisabled,
	copied,
	fullText,
	canRetry,
	onCopy,
	onRegenerate,
	onRetry,
	onSynthesize,
	onListenError,
}: AssistantMessageActionsProps) {
	const shouldAnimate = useShouldAnimate();
	const [spinKey, setSpinKey] = useState(0);

	const handleRegenerate = () => {
		setSpinKey((k) => k + 1);
		onRegenerate();
	};

	return (
		<div className="opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">
			<MessageActions className="rounded-lg bg-background/95 p-1 shadow-sm backdrop-blur-xs">
				{fullText ? (
					<MessageAction
						className="size-7 text-muted-foreground hover:text-foreground"
						label={
							copied
								? messageActionLabels.copied.aria
								: messageActionLabels.copy.aria
						}
						onClick={onCopy}
						tooltip={
							copied
								? messageActionLabels.copied.tooltip
								: messageActionLabels.copy.tooltip
						}
					>
						{copied ? (
							<CheckIcon className="size-3.5" />
						) : (
							<CopyIcon className="size-3.5" />
						)}
					</MessageAction>
				) : null}
				{/* FN-043 (#486): read the reply aloud via free edge-TTS. */}
				{fullText && onSynthesize ? (
					<ListenButton
						text={fullText}
						synthesize={onSynthesize}
						onError={onListenError}
						disabled={actionDisabled}
					/>
				) : null}
				<MessageAction
					className="size-7 text-muted-foreground hover:text-foreground"
					label={messageActionLabels.regenerate.aria}
					onClick={handleRegenerate}
					tooltip={messageActionLabels.regenerate.tooltip}
					disabled={actionDisabled}
				>
					{shouldAnimate ? (
						<motion.span
							key={spinKey}
							initial={{ rotate: 0 }}
							animate={{ rotate: 360 }}
							transition={{
								duration: motionDuration.slow,
								ease: ease.emphasized,
							}}
							style={{ display: "inline-flex", willChange: "transform" }}
						>
							<RefreshCwIcon className="size-3.5" />
						</motion.span>
					) : (
						<RefreshCwIcon className="size-3.5" />
					)}
				</MessageAction>
				{canRetry ? (
					<MessageAction
						className="size-7 text-muted-foreground hover:text-foreground"
						label={messageActionLabels.retry.aria}
						onClick={onRetry}
						tooltip={messageActionLabels.retry.tooltip}
						disabled={actionDisabled}
					>
						<RotateCcwIcon className="size-3.5" />
					</MessageAction>
				) : null}
			</MessageActions>
		</div>
	);
}
