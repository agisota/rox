import {
	Message,
	MessageBlockCopy,
	MessageContent,
	type MessageResponseProps,
} from "@rox/ui/ai-elements/message";
import { ShimmerLabel } from "@rox/ui/ai-elements/shimmer-label";
import { AnimatedFileLink } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import type { SynthesizedAudio } from "@rox/ui/voice";
import { FileSearchIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { StreamingMessageText } from "renderer/components/Chat/ChatInterface/components/MessagePartsRenderer/components/StreamingMessageText";
import { ReasoningBlock } from "renderer/components/Chat/ChatInterface/components/ReasoningBlock";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import { normalizeToolName } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { UseChatDisplayReturn } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/hooks/useWorkspaceChatDisplay";
import { useTabsStore } from "renderer/stores/tabs/store";
import { AttachmentChip } from "../AttachmentChip";
import { ImageHoverPreview } from "../ImageHoverPreview";
import { PendingPlanApprovalMessage } from "../PendingPlanApprovalMessage";
import { ActivityWorklogSection } from "./ActivityWorklogSection";
import { AssistantMessageActions } from "./AssistantMessageActions";
import { getAssistantMessageText } from "./getAssistantMessageText";

type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];
type ChatMessageContent = ChatMessage["content"][number];
type ChatToolCall = Extract<ChatMessageContent, { type: "tool_call" }>;
type ChatToolResult = Extract<ChatMessageContent, { type: "tool_result" }>;
type ChatPendingPlanApproval = UseChatDisplayReturn["pendingPlanApproval"];

interface AssistantMessageProps {
	message: ChatMessage;
	isStreaming: boolean;
	workspaceId: string;
	sessionId?: string | null;
	organizationId?: string | null;
	workspaceCwd?: string;
	previewToolParts?: ToolPart[];
	footer?: ReactNode;
	pendingPlanApproval?: ChatPendingPlanApproval;
	pendingPlanToolCallId?: string | null;
	isPlanSubmitting?: boolean;
	onPlanRespond?: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
	/** F43: re-run the turn that produced this assistant answer (regenerate). */
	onRegenerate?: () => void;
	/** F43: retry the last request as-is (shown for interrupted answers). */
	onRetry?: () => void;
	/** F43: true when this answer was interrupted and can be retried. */
	canRetry?: boolean;
	/** F43: disable destructive actions while another turn is in flight. */
	actionDisabled?: boolean;
}

function ImagePart({ data, mimeType }: { data: string; mimeType: string }) {
	return (
		<img
			src={`data:${mimeType};base64,${data}`}
			alt="Вложение"
			className="max-h-48 rounded-lg object-contain"
		/>
	);
}

function findToolResultForCall({
	content,
	toolCallId,
	startAt,
}: {
	content: ChatMessage["content"];
	toolCallId: string;
	startAt: number;
}): { result: ChatToolResult | null; index: number } {
	for (let index = startAt; index < content.length; index++) {
		const part = content[index];
		if (part.type === "tool_result" && part.id === toolCallId) {
			return { result: part, index };
		}
	}
	return { result: null, index: -1 };
}

function toToolPartFromCall({
	part,
	result,
	isStreaming,
}: {
	part: ChatToolCall;
	result: ChatToolResult | null;
	isStreaming: boolean;
}): ToolPart {
	return {
		type: `tool-${normalizeToolName(part.name)}` as ToolPart["type"],
		toolCallId: part.id,
		state: result?.isError
			? "output-error"
			: result
				? "output-available"
				: isStreaming
					? "input-streaming"
					: "input-available",
		input: part.args,
		...(result ? { output: result.result } : {}),
	} as ToolPart;
}

function toToolPartFromResult(part: ChatToolResult): ToolPart {
	return {
		type: `tool-${normalizeToolName(part.name)}` as ToolPart["type"],
		toolCallId: part.id,
		state: part.isError ? "output-error" : "output-available",
		input: {},
		output: part.result,
	} as ToolPart;
}

export function AssistantMessage({
	message,
	isStreaming,
	workspaceId,
	sessionId,
	previewToolParts = [],
	footer,
	pendingPlanApproval,
	pendingPlanToolCallId = null,
	isPlanSubmitting = false,
	onPlanRespond,
	onRegenerate,
	onRetry,
	canRetry = false,
	actionDisabled = false,
}: AssistantMessageProps) {
	const addFileViewerPane = useTabsStore((store) => store.addFileViewerPane);
	const { copyToClipboard } = useCopyToClipboard();
	const ttsUtils = electronTrpc.useUtils();
	const [copied, setCopied] = useState(false);
	const fullText = getAssistantMessageText(message);
	const handleCopyFull = useCallback(() => {
		if (!fullText) return;
		void copyToClipboard(fullText);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}, [fullText, copyToClipboard]);
	// FN-043 (#486): synthesize this reply to speech via the desktop edge-TTS
	// router for the "Прослушать" button. Kept here (the desktop edge) so the
	// shared ListenButton stays IPC-free and reusable on web/mobile.
	const handleSynthesize = useCallback(
		(text: string): Promise<SynthesizedAudio> =>
			ttsUtils.client.tts.synthesize.mutate({ text }),
		[ttsUtils],
	);
	const handleListenError = useCallback((error: unknown) => {
		const detail = error instanceof Error ? error.message : "";
		toast.error(
			detail
				? `Не удалось озвучить ответ: ${detail}`
				: "Не удалось озвучить ответ",
		);
	}, []);
	const showActions =
		!isStreaming && Boolean(onRegenerate) && message.content.length > 0;
	const nodes: ReactNode[] = [];
	const renderedToolCallIds = new Set<string>();
	let didRenderPendingPlanApproval = false;
	// F39: buffer consecutive tool parts so a run collapses into ONE persistent,
	// verb-bucketed Activity worklog timeline instead of N standalone blocks.
	let pendingToolParts: ToolPart[] = [];
	const flushActivityWorklog = () => {
		if (pendingToolParts.length === 0) return;
		const runParts = pendingToolParts;
		pendingToolParts = [];
		nodes.push(
			<ActivityWorklogSection
				key={`${message.id}-activity-${runParts[0].toolCallId}`}
				parts={runParts}
				chatId={sessionId ?? message.id}
			/>,
		);
	};
	const handleAttachmentClick = useCallback(
		(url: string, filename?: string) => {
			addFileViewerPane(workspaceId, {
				filePath: url,
				isPinned: true,
				...(filename ? { displayName: filename } : {}),
			});
		},
		[addFileViewerPane, workspaceId],
	);
	const getInlineToolStateNodes = (toolCallId: string): ReactNode[] => {
		const inlineNodes: ReactNode[] = [];

		if (
			!didRenderPendingPlanApproval &&
			pendingPlanApproval &&
			pendingPlanToolCallId &&
			pendingPlanToolCallId === toolCallId &&
			onPlanRespond
		) {
			didRenderPendingPlanApproval = true;
			inlineNodes.push(
				<PendingPlanApprovalMessage
					key={`${message.id}-pending-plan-${toolCallId}`}
					planApproval={pendingPlanApproval}
					isSubmitting={isPlanSubmitting}
					onRespond={onPlanRespond}
					inline
				/>,
			);
		}

		return inlineNodes;
	};
	for (let partIndex = 0; partIndex < message.content.length; partIndex++) {
		const part = message.content[partIndex];

		// F39: a non-tool part ends the current tool run — flush the worklog first
		// so the timeline renders in transcript order.
		if (part.type !== "tool_call" && part.type !== "tool_result") {
			flushActivityWorklog();
		}

		if (part.type === "text") {
			const blockText = part.text;
			nodes.push(
				<div
					key={`${message.id}-${partIndex}`}
					className="group/block relative"
				>
					<StreamingMessageText
						text={blockText}
						isAnimating={isStreaming}
						mermaid={{
							config: {
								theme: "default",
							},
						}}
						components={{
							a: AnimatedFileLink as NonNullable<
								MessageResponseProps["components"]
							>["a"],
						}}
					/>
					{!isStreaming && blockText.trim() ? (
						<MessageBlockCopy
							text={blockText}
							onCopyText={copyToClipboard}
							className="absolute top-0 right-0 size-7 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/block:opacity-100 group-focus-within/block:opacity-100"
						/>
					) : null}
				</div>,
			);
			continue;
		}

		if (part.type === "thinking") {
			nodes.push(
				<ReasoningBlock
					key={`${message.id}-${partIndex}`}
					reasoning={part.thinking}
				/>,
			);
			continue;
		}

		const rawPart = part as {
			data?: string;
			filename?: string;
			image?: string;
			mediaType?: string;
			mimeType?: string;
			type?: string;
		};
		if (part.type === "image" || rawPart.type === "file") {
			const mediaType =
				rawPart.mediaType ?? rawPart.mimeType ?? "application/octet-stream";
			const data = rawPart.data ?? rawPart.image ?? "";
			if (!data) {
				continue;
			}

			if (part.type === "image" && "mimeType" in part && !rawPart.mediaType) {
				const legacySrc = `data:${part.mimeType};base64,${part.data}`;
				nodes.push(
					<ImageHoverPreview
						key={`${message.id}-${partIndex}`}
						src={legacySrc}
						mediaType={part.mimeType}
						triggerClassName="max-w-[85%]"
					>
						<ImagePart data={part.data} mimeType={part.mimeType} />
					</ImageHoverPreview>,
				);
				continue;
			}

			if (mediaType.startsWith("image/")) {
				nodes.push(
					<ImageHoverPreview
						key={`${message.id}-${partIndex}`}
						src={data}
						filename={rawPart.filename}
						mediaType={mediaType}
						alt={rawPart.filename ?? "Сгенерировано"}
						triggerClassName="max-w-[85%]"
					>
						<button
							type="button"
							className="cursor-pointer"
							aria-label={
								rawPart.filename
									? `Открыть ${rawPart.filename}`
									: "Открыть сгенерированное изображение"
							}
							onClick={() => handleAttachmentClick(data, rawPart.filename)}
						>
							<img
								src={data}
								alt={rawPart.filename ?? "Сгенерировано"}
								className="max-h-48 rounded-lg object-contain"
							/>
						</button>
					</ImageHoverPreview>,
				);
			} else {
				nodes.push(
					<AttachmentChip
						key={`${message.id}-${partIndex}`}
						data={data}
						filename={rawPart.filename}
						mediaType={mediaType}
						onClick={() => handleAttachmentClick(data, rawPart.filename)}
					/>,
				);
			}
			continue;
		}

		if (part.type === "tool_call") {
			if (renderedToolCallIds.has(part.id)) {
				continue;
			}
			renderedToolCallIds.add(part.id);
			const { result, index: resultIndex } = findToolResultForCall({
				content: message.content,
				toolCallId: part.id,
				startAt: partIndex + 1,
			});

			pendingToolParts.push(
				toToolPartFromCall({
					part,
					result,
					isStreaming,
				}),
			);

			// Inline plan approval must appear after the buffered run, in order.
			const inlineNodes = getInlineToolStateNodes(part.id);
			if (inlineNodes.length > 0) {
				flushActivityWorklog();
				nodes.push(...inlineNodes);
			}

			if (resultIndex === partIndex + 1) {
				partIndex++;
			}
			continue;
		}

		if (part.type === "tool_result") {
			if (renderedToolCallIds.has(part.id)) {
				continue;
			}
			renderedToolCallIds.add(part.id);
			pendingToolParts.push(toToolPartFromResult(part));

			const inlineResultNodes = getInlineToolStateNodes(part.id);
			if (inlineResultNodes.length > 0) {
				flushActivityWorklog();
				nodes.push(...inlineResultNodes);
			}
			continue;
		}

		if (part.type.startsWith("om_")) {
			nodes.push(
				<div
					key={`${message.id}-${partIndex}`}
					className="flex items-center gap-2 text-xs text-muted-foreground"
				>
					<FileSearchIcon className="size-3.5" />
					<span>{part.type.replaceAll("_", " ")}</span>
				</div>,
			);
		}
	}

	for (const previewPart of previewToolParts) {
		if (renderedToolCallIds.has(previewPart.toolCallId)) continue;
		pendingToolParts.push(previewPart);
		const previewInlineNodes = getInlineToolStateNodes(previewPart.toolCallId);
		if (previewInlineNodes.length > 0) {
			flushActivityWorklog();
			nodes.push(...previewInlineNodes);
		}
	}

	// F39: flush any trailing tool run into a final Activity worklog.
	flushActivityWorklog();

	return (
		<Message from="assistant" className="group/msg">
			<MessageContent>
				{nodes.length === 0 && isStreaming ? (
					<ShimmerLabel className="text-sm text-muted-foreground">
						Думаю…
					</ShimmerLabel>
				) : (
					nodes
				)}
				{footer}
				{showActions && onRegenerate ? (
					<AssistantMessageActions
						actionDisabled={actionDisabled}
						copied={copied}
						fullText={fullText}
						canRetry={canRetry}
						onCopy={handleCopyFull}
						onRegenerate={onRegenerate}
						onRetry={onRetry ?? onRegenerate}
						onSynthesize={handleSynthesize}
						onListenError={handleListenError}
					/>
				) : null}
			</MessageContent>
		</Message>
	);
}
