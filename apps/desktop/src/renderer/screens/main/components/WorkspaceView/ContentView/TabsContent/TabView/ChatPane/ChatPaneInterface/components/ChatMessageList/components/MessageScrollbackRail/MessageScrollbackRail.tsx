import type { UseChatDisplayReturn } from "@rox/chat/client";
import type { ScrollbackRecent } from "@rox/ui/ai-elements/message-scrollback-rail";
import { MessageScrollbackRail as SharedMessageScrollbackRail } from "@rox/ui/ai-elements/message-scrollback-rail";
import { deriveOutlineEntries } from "@rox/ui/ai-elements/message-scrollback-rail-core";
import { useMemo } from "react";

type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

const RAIL_LABELS = {
	attachmentSingular: () => "Отправлено 1 вложение",
	attachmentPlural: (count: number) => `Отправлено вложений: ${count}`,
	empty: "(пустое сообщение)",
};

interface MessageScrollbackRailProps {
	messages: ChatMessage[];
	recents?: ScrollbackRecent[];
	onSelectRecent?: (sessionId: string) => void;
}

/**
 * Thin desktop adapter over the consolidated `@rox/ui` rail (F49). Derives the
 * serializable outline from the transcript message stream and forwards the
 * cross-session Recents-flyout wiring.
 */
export function MessageScrollbackRail({
	messages,
	recents,
	onSelectRecent,
}: MessageScrollbackRailProps) {
	const entries = useMemo(
		() => deriveOutlineEntries(messages, RAIL_LABELS),
		[messages],
	);
	return (
		<SharedMessageScrollbackRail
			entries={entries}
			recents={recents}
			onSelectRecent={onSelectRecent}
			recentsLabel="Недавние чаты"
		/>
	);
}
