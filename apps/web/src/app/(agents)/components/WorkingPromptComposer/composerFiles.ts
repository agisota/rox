import type { PromptInputMessage } from "@rox/ui/ai-elements/prompt-input";

/**
 * One composer attachment as `PromptInput` hands it to `onSubmit`. Derived from
 * the UI package's exported {@link PromptInputMessage} rather than importing
 * `ai`'s `FileUIPart` directly — `ai` is a transitive dep of `@rox/ui`, not a
 * direct dep of `@rox/web`, so anchoring to the re-exported shape keeps the
 * web package's dependency boundary intact.
 */
export type ComposerFilePart = PromptInputMessage["files"][number];

/**
 * Host chat-attachment shape expected by the write seam
 * (`HostWriteClient.chat.sendMessage` → host `chat.sendMessage`'s
 * `payload.files[]`, see `@rox/shared/host-client` host-write-client.ts:69-73).
 * The host wants the raw base64/`data:` payload + IANA media type, not the
 * AI-SDK `FileUIPart` (which carries a `url` Data URL).
 */
export type HostChatAttachment = {
	data: string;
	mediaType: string;
	filename?: string;
};

/**
 * Map AI-SDK {@link FileUIPart} attachments (what `PromptInput` hands to
 * `onSubmit`) into the host's chat-attachment shape. `PromptInput` converts
 * picked files to Data URLs, so `part.url` is a `data:<mime>;base64,<payload>`
 * string; we forward the base64 payload (the substring after the comma) as
 * `data`. A non-data `url` (already-hosted file) is forwarded verbatim so the
 * host can fetch it. Pure + exported so the send wiring can be unit-tested
 * without a browser `FileReader`.
 */
export function mapComposerFilesToHostAttachments(
	files: ComposerFilePart[],
): HostChatAttachment[] {
	return files.map((file) => ({
		data: extractDataUrlPayload(file.url),
		mediaType: file.mediaType,
		...(file.filename ? { filename: file.filename } : {}),
	}));
}

/**
 * Return the base64 payload of a `data:` URL, or the URL unchanged when it is
 * not a Data URL (e.g. an already-hosted `https://` file the host can fetch).
 */
export function extractDataUrlPayload(url: string): string {
	if (!url.startsWith("data:")) {
		return url;
	}
	const commaIndex = url.indexOf(",");
	return commaIndex === -1 ? url : url.slice(commaIndex + 1);
}
