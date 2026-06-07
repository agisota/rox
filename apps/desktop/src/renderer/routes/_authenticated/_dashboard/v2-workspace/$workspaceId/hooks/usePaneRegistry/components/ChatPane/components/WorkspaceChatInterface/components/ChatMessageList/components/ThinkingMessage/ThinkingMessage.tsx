import { Message, MessageContent } from "@rox/ui/ai-elements/message";
import { ShimmerLabel } from "@rox/ui/ai-elements/shimmer-label";
import { ThinkingDots, useShouldAnimate } from "renderer/motion";

export function ThinkingMessage() {
	const shouldAnimate = useShouldAnimate("decorative");
	return (
		<Message from="assistant">
			<MessageContent>
				<span className="inline-flex items-center gap-1.5">
					<ShimmerLabel
						className="text-sm text-muted-foreground"
						isShimmering={shouldAnimate}
						duration={2.4}
					>
						Thinking
					</ShimmerLabel>
					<ThinkingDots className="text-sm text-muted-foreground" />
				</span>
			</MessageContent>
		</Message>
	);
}
