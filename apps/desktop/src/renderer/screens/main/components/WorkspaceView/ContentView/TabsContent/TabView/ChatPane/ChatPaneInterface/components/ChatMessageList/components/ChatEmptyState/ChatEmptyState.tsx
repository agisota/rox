import { ConversationEmptyState } from "@rox/ui/ai-elements/conversation";
import { usePromptInputController } from "@rox/ui/ai-elements/prompt-input";
import { type EmptyStateChip, EmptyStateChips } from "@rox/ui/empty-state";
import { useMemo } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import { useEmptyStateSuggestions } from "renderer/hooks/useEmptyStateSuggestions";

interface ChatEmptyStateProps {
	/** Active workspace name, to tint the seeded copy (F21/F25). */
	workspaceName?: string | null;
}

/**
 * Chat empty state (F57, #650). Wraps the shared `ConversationEmptyState` and
 * appends AI-seeded starter chips from `suggestions.forSurface`. Clicking a chip
 * loads its prompt into the composer via `usePromptInputController` (F42) rather
 * than auto-sending, so the user stays in control before submitting.
 */
export function ChatEmptyState({ workspaceName }: ChatEmptyStateProps) {
	const { textInput } = usePromptInputController();
	const { suggestions, isLoading } = useEmptyStateSuggestions({
		surface: "chat",
		workspaceName,
	});

	const chips = useMemo<EmptyStateChip[]>(
		() =>
			suggestions.map((s) => ({
				id: s.id,
				label: s.label,
				onSelect: () => textInput.setInput(s.prompt),
			})),
		[suggestions, textInput],
	);

	return (
		<ConversationEmptyState
			title="Начните разговор"
			description="Задайте любой вопрос, чтобы начать"
			icon={<HiMiniChatBubbleLeftRight className="size-8" />}
			footer={
				<EmptyStateChips
					className="mt-1"
					chips={chips}
					chipsLoading={isLoading}
				/>
			}
		/>
	);
}
