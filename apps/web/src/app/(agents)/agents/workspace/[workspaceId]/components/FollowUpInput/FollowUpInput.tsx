"use client";

import type { PromptInputMessage } from "@rox/ui/ai-elements/prompt-input";
import { useCallback } from "react";
import { createRelayHostWriteClient } from "../../../../../../../trpc/host-client";
import { PreviewPromptComposer } from "../../../../../components/PreviewPromptComposer";
import {
	mapComposerFilesToHostAttachments,
	WorkingPromptComposer,
} from "../../../../../components/WorkingPromptComposer";

/**
 * Target an attached host chat session for a live follow-up send. The live
 * session page is a CHAT surface (its transcript is read via
 * `HostClient.chat.listMessages`), so the matching write method is
 * `HostWriteClient.chat.sendMessage` — NOT `agent.launch` (that is the
 * new-session/launch surface, which has no attached host yet).
 */
export type FollowUpLiveSend = {
	routingKey: string;
	workspaceId: string;
	/** Host chat/session id the message is appended to. */
	sessionId: string;
};

type FollowUpInputProps = {
	modelName: string;
	/**
	 * When present, the composer is LIVE: send dispatches to the attached host
	 * over the relay write seam. When absent (mock prototype path), the original
	 * read-only preview composer is rendered unchanged.
	 */
	liveSend?: FollowUpLiveSend;
};

const CONTAINER_CLASS_NAME =
	"sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/60";
const PROMPT_INPUT_CLASS_NAME =
	"[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]";
const MESSAGE_CLASS_NAME = "pt-2 text-xs text-muted-foreground";

/**
 * Send a composed follow-up message to a host chat session via the additive
 * {@link createRelayHostWriteClient} write seam (Wave 5). Exported so the send
 * wiring is unit-testable by mocking the write-client factory. Returns the
 * host's send result (opaque) on success; the caller awaits and lets a
 * rejection restore the composer draft.
 */
export async function sendFollowUpToHost(
	target: FollowUpLiveSend,
	message: PromptInputMessage,
): Promise<void> {
	const writeClient = createRelayHostWriteClient(target.routingKey);
	const files = mapComposerFilesToHostAttachments(message.files);
	await writeClient.chat.sendMessage({
		sessionId: target.sessionId,
		workspaceId: target.workspaceId,
		content: message.text,
		...(files.length > 0 ? { files } : {}),
	});
}

export function FollowUpInput({ modelName, liveSend }: FollowUpInputProps) {
	const handleSend = useCallback(
		async (message: PromptInputMessage) => {
			if (!liveSend) return;
			await sendFollowUpToHost(liveSend, message);
		},
		[liveSend],
	);

	// Mock prototype path: unchanged read-only preview composer.
	if (!liveSend) {
		return (
			<PreviewPromptComposer
				containerClassName={CONTAINER_CLASS_NAME}
				promptInputClassName={PROMPT_INPUT_CLASS_NAME}
				placeholder="Продолжение сессий в веб-версии скоро появится"
				footerTools={
					<span className="text-xs text-muted-foreground">{modelName}</span>
				}
				messageClassName={MESSAGE_CLASS_NAME}
			/>
		);
	}

	// Live path: a REAL composer whose send dispatches over the host write seam.
	return (
		<WorkingPromptComposer
			onSend={handleSend}
			containerClassName={CONTAINER_CLASS_NAME}
			promptInputClassName={PROMPT_INPUT_CLASS_NAME}
			placeholder={`Сообщение для ${modelName}…`}
			footerTools={
				<span className="text-xs text-muted-foreground">{modelName}</span>
			}
			messageClassName={MESSAGE_CLASS_NAME}
		/>
	);
}
