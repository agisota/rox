import type { UseChatDisplayReturn } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/hooks/useWorkspaceChatDisplay";

type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

/**
 * F43: serialize an assistant message's text/thinking blocks back into the
 * markdown the user sees, so "copy full" preserves formatting (headings,
 * code fences, Mermaid/KaTeX source) instead of the rendered DOM. Tool calls,
 * images and other non-text parts are intentionally skipped — copy yields the
 * answer prose, matching the user-message copy behaviour.
 */
export function getAssistantMessageText(message: ChatMessage): string {
	return message.content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join("\n\n")
		.trim();
}
