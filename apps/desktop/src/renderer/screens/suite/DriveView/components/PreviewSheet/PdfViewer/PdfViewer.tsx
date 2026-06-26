import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@rox/ui/button";
// Lazy worker: Vite emits the pdf.js worker as a separate chunk referenced by
// URL so it is fetched on demand instead of being inlined into the renderer
// bundle. Works in the Electron renderer (Chromium) with no native modules.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./PdfViewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Resolve pdf.js asset directories (cmaps for CJK encodings, standard fonts for
// PDFs that don't embed fonts) from the worker URL Vite emitted: both live in
// the bundled `pdfjs-dist/build` directory's siblings, so deriving them from the
// worker URL keeps them correct after bundling without hard-coding a path.
const PDFJS_BASE = new URL(".", pdfWorkerUrl).href;
const CMAP_URL = new URL("../cmaps/", PDFJS_BASE).href;
const STANDARD_FONTS_URL = new URL("../standard_fonts/", PDFJS_BASE).href;

interface PdfViewerProps {
	/** Presigned GET URL for the PDF bytes (straight from R2). */
	url: string;
}

/** Stable options object so react-pdf doesn't reload the document each render. */
const DOCUMENT_OPTIONS = {
	cMapUrl: CMAP_URL,
	standardFontDataUrl: STANDARD_FONTS_URL,
} as const;

/**
 * Paged PDF viewer: renders one page to canvas at a time with prev/next
 * navigation and a page counter. The pdf.js worker is loaded lazily (see the
 * `?url` import above) so it stays out of the main renderer chunk. Fed a
 * short-TTL presigned URL from `drive.requestDownload`.
 */
export function PdfViewer({ url }: PdfViewerProps) {
	const [numPages, setNumPages] = useState(0);
	const [pageNumber, setPageNumber] = useState(1);
	const [error, setError] = useState<string | null>(null);

	const file = useMemo(() => ({ url }), [url]);

	const onLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
		setNumPages(n);
		setPageNumber(1);
		setError(null);
	}, []);

	const onLoadError = useCallback(() => {
		setError("Не удалось загрузить PDF");
	}, []);

	const goPrev = useCallback(
		() => setPageNumber((p) => Math.max(1, p - 1)),
		[],
	);
	const goNext = useCallback(
		() => setPageNumber((p) => Math.min(numPages || p, p + 1)),
		[numPages],
	);

	if (error) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
				<p className="cursor-text select-text text-destructive text-sm">
					{error}
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-3">
			<div className="min-h-0 flex-1 overflow-auto rounded-lg bg-muted/20">
				<Document
					file={file}
					options={DOCUMENT_OPTIONS}
					onLoadSuccess={onLoadSuccess}
					onLoadError={onLoadError}
					loading={
						<div className="flex h-64 items-center justify-center">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					}
					error={
						<div className="flex h-64 items-center justify-center">
							<p className="cursor-text select-text text-destructive text-sm">
								Не удалось загрузить PDF
							</p>
						</div>
					}
					className="rox-pdf-document"
				>
					<Page
						pageNumber={pageNumber}
						renderAnnotationLayer
						renderTextLayer
						className="rox-pdf-page"
						width={520}
						loading={
							<div className="flex h-64 items-center justify-center">
								<Loader2 className="size-6 animate-spin text-muted-foreground" />
							</div>
						}
					/>
				</Document>
			</div>

			{numPages > 0 ? (
				<div className="flex items-center justify-center gap-3">
					<Button
						type="button"
						variant="outline"
						size="icon"
						disabled={pageNumber <= 1}
						onClick={goPrev}
						aria-label="Предыдущая страница"
					>
						<ChevronLeft className="size-4" />
					</Button>
					<span className="select-none text-muted-foreground text-sm tabular-nums">
						{pageNumber} / {numPages}
					</span>
					<Button
						type="button"
						variant="outline"
						size="icon"
						disabled={pageNumber >= numPages}
						onClick={goNext}
						aria-label="Следующая страница"
					>
						<ChevronRight className="size-4" />
					</Button>
				</div>
			) : null}
		</div>
	);
}
