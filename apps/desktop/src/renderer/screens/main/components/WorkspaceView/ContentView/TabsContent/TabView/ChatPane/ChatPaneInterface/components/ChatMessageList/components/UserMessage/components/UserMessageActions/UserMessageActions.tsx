import { MessageAction, MessageActions } from "@rox/ui/ai-elements/message";
import { motion } from "framer-motion";
import {
	CheckIcon,
	CopyIcon,
	PencilLineIcon,
	RotateCcwIcon,
} from "lucide-react";
import { useState } from "react";
import { ease, motionDuration, useShouldAnimate } from "renderer/motion";

interface UserMessageActionsProps {
	actionDisabled: boolean;
	copied: boolean;
	fullText: string;
	onCopy: () => void;
	onEdit: () => void;
	onResend: () => void;
}

export function UserMessageActions({
	actionDisabled,
	copied,
	fullText,
	onCopy,
	onEdit,
	onResend,
}: UserMessageActionsProps) {
	const shouldAnimate = useShouldAnimate();
	const [spinKey, setSpinKey] = useState(0);

	const handleResend = () => {
		setSpinKey((k) => k + 1);
		onResend();
	};

	return (
		<div className="opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">
			<MessageActions className="rounded-lg bg-background/95 p-1 shadow-sm backdrop-blur-xs">
				<MessageAction
					className="size-7 text-muted-foreground hover:text-foreground"
					label="Resend message"
					onClick={handleResend}
					tooltip="Resend"
					disabled={actionDisabled}
				>
					{shouldAnimate ? (
						<motion.span
							key={spinKey}
							initial={{ rotate: 0 }}
							animate={{ rotate: -360 }}
							transition={{
								duration: motionDuration.slow,
								ease: ease.emphasized,
							}}
							style={{ display: "inline-flex", willChange: "transform" }}
						>
							<RotateCcwIcon className="size-3.5" />
						</motion.span>
					) : (
						<RotateCcwIcon className="size-3.5" />
					)}
				</MessageAction>
				<MessageAction
					className="size-7 text-muted-foreground hover:text-foreground"
					label="Edit message"
					onClick={onEdit}
					tooltip="Edit"
					disabled={actionDisabled}
				>
					<PencilLineIcon className="size-3.5" />
				</MessageAction>
				{fullText ? (
					<MessageAction
						className="size-7 text-muted-foreground hover:text-foreground"
						label={copied ? "Copied" : "Copy message"}
						onClick={onCopy}
						tooltip={copied ? "Copied" : "Copy"}
					>
						{copied ? (
							<CheckIcon className="size-3.5" />
						) : (
							<CopyIcon className="size-3.5" />
						)}
					</MessageAction>
				) : null}
			</MessageActions>
		</div>
	);
}
