import { MessageScrollbackRail as SharedMessageScrollbackRail } from "@rox/ui/ai-elements/message-scrollback-rail";
import { deriveOutlineEntries } from "@rox/ui/ai-elements/message-scrollback-rail-core";
import type { UIMessage } from "ai";
import { useMemo } from "react";

interface MessageScrollbackRailProps {
	messages: UIMessage[];
}

/**
 * Thin desktop adapter over the consolidated `@rox/ui` rail (F49). Derives the
 * serializable outline from the `ai` SDK `UIMessage` stream and delegates all
 * rendering/behaviour to the shared component.
 */
export function MessageScrollbackRail({
	messages,
}: MessageScrollbackRailProps) {
	const entries = useMemo(() => deriveOutlineEntries(messages), [messages]);
	return <SharedMessageScrollbackRail entries={entries} />;
}
