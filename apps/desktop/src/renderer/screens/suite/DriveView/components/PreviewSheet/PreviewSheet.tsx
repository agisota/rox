import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@rox/ui/sheet";
import { Download, Loader2, Share2 } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { formatFileSize } from "../../../utils/formatFileSize";
import type { DriveFile } from "../../types";
import { fileIcon, fileKind, isPreviewable } from "../../utils/fileKind";
import { ImageLightbox } from "./ImageLightbox";

// Lazy: pulls react-pdf + the pdf.js worker into a separate chunk that only
// loads when a PDF is actually previewed, keeping the worker out of the main
// renderer bundle.
const PdfViewer = lazy(() =>
	import("./PdfViewer").then((m) => ({ default: m.PdfViewer })),
);

interface PreviewSheetProps {
	file: DriveFile | null;
	onOpenChange: (open: boolean) => void;
	getPreviewUrl: (fileId: string) => Promise<string>;
	onDownload: (fileId: string) => void;
	onShare: (file: DriveFile) => void;
}

type PreviewState =
	| { phase: "idle" }
	| { phase: "loading" }
	| { phase: "ready"; url: string }
	| { phase: "error"; message: string };

/** Map non-clean scan states to explicit RU messages (router withholds URL). */
export function scanStateMessage(status: DriveFile["status"]): string | null {
	if (status === "clean") return null;
	if (status === "quarantined") return "Файл не прошёл проверку безопасности";
	return "Файл ещё обрабатывается";
}

/**
 * Right-docked glass preview. Fetches a short-TTL presigned GET via
 * `drive.requestDownload` (never proxied — bytes come straight from R2) and
 * renders by media kind: images / video / audio inline, text + code fetched and
 * shown in a Victor-Mono `<pre>`, everything else as an info card with download
 * + share. Non-clean files surface their scan state instead of a URL, matching
 * the server-side gate.
 *
 * Images open in a zoom/pan lightbox (`yet-another-react-lightbox` + Zoom) and
 * PDFs in a lazily-loaded paged viewer (`react-pdf`); unsupported kinds keep the
 * generic card + download fallback.
 */
export function PreviewSheet({
	file,
	onOpenChange,
	getPreviewUrl,
	onDownload,
	onShare,
}: PreviewSheetProps) {
	const [state, setState] = useState<PreviewState>({ phase: "idle" });
	const [textBody, setTextBody] = useState<string | null>(null);

	const kind = file ? fileKind(file.mediaType, file.name) : "other";
	const scanMsg = file ? scanStateMessage(file.status) : null;
	const previewable = file != null && scanMsg === null && isPreviewable(kind);

	useEffect(() => {
		setTextBody(null);
		if (!file || scanMsg !== null || !isPreviewable(kind)) {
			setState({ phase: "idle" });
			return;
		}

		let cancelled = false;
		setState({ phase: "loading" });
		getPreviewUrl(file.id)
			.then(async (url) => {
				if (cancelled) return;
				if (kind === "text" || kind === "code") {
					const res = await fetch(url);
					const body = await res.text();
					if (!cancelled) {
						setTextBody(body.slice(0, 200_000));
						setState({ phase: "ready", url });
					}
					return;
				}
				setState({ phase: "ready", url });
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setState({
					phase: "error",
					message:
						error instanceof Error
							? error.message
							: "Не удалось загрузить предпросмотр",
				});
			});

		return () => {
			cancelled = true;
		};
	}, [file, kind, scanMsg, getPreviewUrl]);

	const Icon = file ? fileIcon(file.mediaType, file.name) : Download;

	return (
		<Sheet open={file !== null} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="glass-panel flex w-[min(560px,90vw)] flex-col gap-0 border-border/60 p-0 sm:max-w-[560px]"
			>
				<SheetHeader className="gap-1 border-border/60 border-b p-4">
					<SheetTitle className="flex min-w-0 items-center gap-2 text-base">
						<Icon className="size-4 shrink-0 text-primary" />
						<span className="truncate">{file?.name}</span>
					</SheetTitle>
					<SheetDescription className="flex items-center gap-2 text-xs">
						{file ? formatFileSize(file.sizeBytes) : null}
						{file && file.status !== "clean" ? (
							<Badge
								variant={
									file.status === "quarantined" ? "destructive" : "secondary"
								}
							>
								{file.status === "quarantined" ? "карантин" : "обработка"}
							</Badge>
						) : null}
					</SheetDescription>
				</SheetHeader>

				<div className="min-h-0 flex-1 overflow-auto p-4">
					{scanMsg ? (
						<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
							<Icon className="size-10 text-muted-foreground" />
							<p className="text-foreground text-sm">{scanMsg}</p>
						</div>
					) : !previewable ? (
						<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
							<Icon className="size-12 text-muted-foreground" />
							<p className="text-muted-foreground text-sm">
								Предпросмотр для этого типа файла недоступен.
							</p>
						</div>
					) : state.phase === "loading" ? (
						<div className="flex h-full items-center justify-center">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : state.phase === "error" ? (
						<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
							<p className="cursor-text select-text text-destructive text-sm">
								{state.message}
							</p>
						</div>
					) : state.phase === "ready" ? (
						<PreviewBody
							kind={kind}
							url={state.url}
							text={textBody}
							name={file?.name ?? "Предпросмотр"}
						/>
					) : null}
				</div>

				<div className="flex items-center gap-2 border-border/60 border-t p-4">
					<Button
						type="button"
						variant="outline"
						className="flex-1"
						disabled={!file || file.status !== "clean"}
						onClick={() => file && onDownload(file.id)}
					>
						<Download className="size-4" /> Скачать
					</Button>
					<Button
						type="button"
						variant="ghost"
						onClick={() => {
							if (file) onShare(file);
						}}
					>
						<Share2 className="size-4" /> Поделиться
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function PreviewBody({
	kind,
	url,
	text,
	name,
}: {
	kind: ReturnType<typeof fileKind>;
	url: string;
	text: string | null;
	name: string;
}) {
	if (kind === "image") {
		return <ImageLightbox url={url} alt={name} />;
	}
	if (kind === "pdf") {
		return (
			<Suspense
				fallback={
					<div className="flex h-full items-center justify-center">
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				}
			>
				<PdfViewer url={url} />
			</Suspense>
		);
	}
	if (kind === "video") {
		return (
			<video
				src={url}
				controls
				className="mx-auto max-h-full w-full rounded-lg"
			>
				<track kind="captions" />
			</video>
		);
	}
	if (kind === "audio") {
		return (
			<div className="flex h-full items-center justify-center">
				{/* biome-ignore lint/a11y/useMediaCaption: user audio file, no captions */}
				<audio src={url} controls className="w-full" />
			</div>
		);
	}
	if ((kind === "text" || kind === "code") && text !== null) {
		return (
			<pre className="cursor-text select-text whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono text-xs text-foreground">
				{text}
			</pre>
		);
	}
	return null;
}
