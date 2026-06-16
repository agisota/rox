import { toast } from "@rox/ui/sonner";
import { TbAlertTriangle, TbClipboardCheck, TbX } from "react-icons/tb";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import {
	type DesignModeCapture,
	formatCaptureForAgent,
	shouldWarnBeforeCapture,
} from "shared/browser";
import {
	type DesignCaptureEventDetail,
	publishDesignCapture,
} from "../../designCaptureBus";

interface DesignModeCapturePreviewProps {
	capture: DesignModeCapture;
	capturing: boolean;
	workspaceId: string;
	browserSessionId: string;
	onDismiss: () => void;
}

export function DesignModeCapturePreview({
	capture,
	workspaceId,
	browserSessionId,
	onDismiss,
}: DesignModeCapturePreviewProps) {
	const { copyToClipboard } = useCopyToClipboard();
	const selector =
		capture.selector.css ?? capture.selector.xpath ?? capture.url;
	const warnRemote = shouldWarnBeforeCapture(capture.url);
	const thumbSrc = capture.screenshot.data
		? `data:${capture.screenshot.mimeType};base64,${capture.screenshot.data}`
		: null;

	const handleCopyForAgent = async () => {
		// Clipboard hand-off references the on-disk screenshot path so CLI agents
		// can read the image; the bus event carries the attachment for composers.
		const clipboardPrompt = formatCaptureForAgent(capture, {
			screenshotRef: "path",
		});
		try {
			await Promise.resolve(copyToClipboard(clipboardPrompt.content));
		} catch {
			toast.error("Could not copy the capture — try again");
			return;
		}

		try {
			const detail: DesignCaptureEventDetail = {
				workspaceId,
				browserSessionId,
				attachment: formatCaptureForAgent(capture, {
					screenshotRef: "attachment",
				}),
			};
			publishDesignCapture(detail);
		} catch {
			toast.warning("Capture copied, but agent hand-off failed");
			return;
		}
		toast.success("Design capture copied — paste it into the agent");
		onDismiss();
	};

	return (
		<div className="absolute right-1 top-full z-50 mt-1 w-72 rounded-md border border-border bg-popover p-2 shadow-md">
			<div className="flex items-start justify-between gap-2">
				<span className="text-xs font-medium text-foreground">
					Selected element
				</span>
				<button
					type="button"
					onClick={onDismiss}
					className="rounded p-0.5 text-muted-foreground/60 hover:text-muted-foreground"
				>
					<TbX className="size-3.5" />
				</button>
			</div>

			{thumbSrc && (
				<img
					src={thumbSrc}
					alt="Selected element"
					className="mt-1.5 max-h-32 w-full rounded border border-border/60 object-contain"
				/>
			)}

			<p className="mt-1.5 break-all font-mono text-[11px] text-muted-foreground select-text cursor-text">
				{selector}
			</p>

			{capture.source && (
				<p className="mt-1 text-[11px] text-muted-foreground/70 select-text cursor-text">
					{capture.source.filePath}
					{capture.source.line != null ? `:${capture.source.line}` : ""} (
					{capture.source.confidence})
				</p>
			)}

			{warnRemote && (
				<p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-500">
					<TbAlertTriangle className="size-3.5 shrink-0" />
					Remote origin — DOM/CSS will be shared with the agent.
				</p>
			)}

			<button
				type="button"
				onClick={() => {
					void handleCopyForAgent();
				}}
				className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
			>
				<TbClipboardCheck className="size-3.5" />
				Copy for agent
			</button>
		</div>
	);
}
