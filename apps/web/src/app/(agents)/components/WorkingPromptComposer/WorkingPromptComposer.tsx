"use client";

import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	PromptInputHeader,
	type PromptInputMessage,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@rox/ui/ai-elements/prompt-input";
import { cn } from "@rox/ui/utils";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { MAX_FILE_SIZE, MAX_FILES } from "../../constants";
import { PlusMenu } from "../PlusMenu";

/**
 * A REAL, write-capable prompt composer for the web `(agents)` surface — the
 * working counterpart of {@link import("../PreviewPromptComposer").PreviewPromptComposer}
 * (which hard-disables every control and no-ops its submit). It reuses the same
 * `@rox/ui` `PromptInput` primitives so the layout/styling stay identical, but
 * the textarea, attachments (`PlusMenu`) and submit are ENABLED and `onSend`
 * dispatches the message.
 *
 * The `PromptInput` is wrapped in a `PromptInputProvider` — the SAME pattern the
 * desktop chat composer uses (`ChatPaneInterface.tsx`) — which is load-bearing,
 * not cosmetic. Without a provider, `PromptInput` runs in self-managed mode where
 * (a) the form is hard-reset BEFORE `onSubmit` and (b) `restoreComposer` is a
 * no-op (prompt-input.tsx:837-839, :861), so a rejected send would SILENTLY LOSE
 * the typed draft. With the provider, `usingProvider` is true: the composer is
 * cleared optimistically on submit and the text + files are RESTORED if `onSend`
 * rejects (prompt-input.tsx:881-901) because we re-throw. So a capability-absent /
 * relay-down host surfaces as a restored draft + inline `role="alert"` error
 * rather than a lost message or a crash. The send state also drives the submit
 * button's `status` (spinner while sending, error glyph on failure).
 */
export type WorkingPromptComposerProps = {
	/** Dispatch the composed message. Reject to signal a failed send. */
	onSend: (message: PromptInputMessage) => Promise<void>;
	placeholder: string;
	promptInputClassName: string;
	footerTools: ReactNode;
	containerClassName?: string;
	footerToolsClassName?: string;
	afterComposer?: ReactNode;
	header?: ReactNode;
	messageClassName?: string;
	/** Extra footer controls rendered left of submit (e.g. a mic button) (F42). */
	footerExtras?: ReactNode;
	/**
	 * Context-usage ring rendered in the left tools cluster, after `footerTools`
	 * (F42). A `ReactNode` so the caller owns the live token inputs.
	 */
	contextRing?: ReactNode;
	/**
	 * Initial draft text for the composer's `PromptInputProvider`, mirroring the
	 * desktop composer's `initialInput`. Lets a remount restore a previously
	 * typed-but-unsent draft.
	 */
	initialInput?: string;
};

export function WorkingPromptComposer({
	onSend,
	placeholder,
	promptInputClassName,
	footerTools,
	containerClassName,
	footerToolsClassName,
	afterComposer,
	header,
	messageClassName,
	footerExtras,
	contextRing,
	initialInput,
}: WorkingPromptComposerProps) {
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// The send is async (a relay round-trip), so its `finally`/`catch` can resolve
	// after this composer has unmounted (e.g. the user navigated away mid-send).
	// Guard the post-await state updates with a mounted ref to avoid a React
	// "set state on an unmounted component" warning.
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			const hasText = message.text.trim().length > 0;
			const hasFiles = message.files.length > 0;
			if (!hasText && !hasFiles) {
				return;
			}
			setSending(true);
			setError(null);
			try {
				await onSend(message);
			} catch (caught) {
				// Capability-absent / relay error: surface inline, never crash. The
				// PromptInput restores the draft (provider mode) because we re-throw.
				if (mountedRef.current) {
					setError(caught instanceof Error ? caught.message : String(caught));
				}
				throw caught;
			} finally {
				if (mountedRef.current) {
					setSending(false);
				}
			}
		},
		[onSend],
	);

	return (
		// PromptInputProvider lifts the textarea + attachment state OUT of
		// PromptInput so the draft survives a failed send (see component doc). This
		// mirrors the desktop chat composer's `<PromptInputProvider>` wrap.
		<PromptInputProvider initialInput={initialInput}>
			<div className={cn(containerClassName)}>
				<PromptInput
					onSubmit={handleSubmit}
					className={promptInputClassName}
					multiple
					maxFiles={MAX_FILES}
					maxFileSize={MAX_FILE_SIZE}
				>
					<PromptInputAttachments>
						{(file) => <PromptInputAttachment key={file.id} data={file} />}
					</PromptInputAttachments>
					{header ? <PromptInputHeader>{header}</PromptInputHeader> : null}
					<PromptInputTextarea placeholder={placeholder} className="min-h-10" />
					<PromptInputFooter>
						<PromptInputTools className={cn(footerToolsClassName)}>
							{footerTools}
							{contextRing}
						</PromptInputTools>
						<div className="flex items-center gap-2">
							<PlusMenu />
							{footerExtras}
							<PromptInputSubmit
								status={sending ? "submitted" : error ? "error" : undefined}
								className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20"
							/>
						</div>
					</PromptInputFooter>
				</PromptInput>
				{afterComposer}
				{error ? (
					<p role="alert" className={cn("text-destructive", messageClassName)}>
						Не удалось отправить: {error}
					</p>
				) : null}
			</div>
		</PromptInputProvider>
	);
}
