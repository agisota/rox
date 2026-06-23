"use client";

import { Button } from "@rox/ui/button";
import { Paperclip, X } from "lucide-react";

/** Human-readable byte size for an attachment chip. */
function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AttachmentChipProps {
	name: string;
	size: number;
	/** When set, the chip is a link to the file (rendered messages). */
	url?: string;
	/** When set, shows a remove control (composer drafts). */
	onRemove?: () => void;
	/** Dim + disable interactions while the file is still uploading. */
	uploading?: boolean;
}

/**
 * A single file attachment, used both in the composer (removable draft) and in
 * rendered message bubbles (a download link). Files are backed by Drive presigned
 * URLs (see `useComposerAttachments`).
 */
export function AttachmentChip({
	name,
	size,
	url,
	onRemove,
	uploading = false,
}: AttachmentChipProps) {
	const label = (
		<span className="flex min-w-0 items-center gap-1.5">
			<Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="truncate text-xs font-medium">{name}</span>
			<span className="shrink-0 text-[10px] text-muted-foreground">
				{formatSize(size)}
			</span>
		</span>
	);

	return (
		<span
			className={`inline-flex max-w-56 items-center gap-1 rounded-md border bg-card px-2 py-1 ${
				uploading ? "opacity-60" : ""
			}`}
		>
			{url ? (
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className="min-w-0 hover:underline"
				>
					{label}
				</a>
			) : (
				label
			)}
			{onRemove && (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-4 shrink-0"
					aria-label={`Удалить вложение ${name}`}
					onClick={onRemove}
				>
					<X className="size-3" />
				</Button>
			)}
		</span>
	);
}
