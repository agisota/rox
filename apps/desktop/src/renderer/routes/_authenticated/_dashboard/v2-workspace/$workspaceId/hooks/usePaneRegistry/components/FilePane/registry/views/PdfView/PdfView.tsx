import { useShouldAnimate } from "@rox/ui/motion";
import { useMemo, useState } from "react";
import { Document, Page } from "react-pdf";
import type { ViewProps } from "../../types";
import { FormatBadge } from "../components/FormatBadge";
import { ensurePdfWorker } from "./pdfWorker";

ensurePdfWorker();

/**
 * Inline paged PDF preview. Reads the document's raw bytes (the store loads
 * PDFs as `bytes` via `isBinaryReadableFile`) and renders every page stacked
 * vertically with pdf.js. Text/annotation layers are disabled so no extra CSS
 * is required and untrusted PDF interactivity stays inert.
 */
export function PdfView({ document: doc, isActive }: ViewProps) {
	const bytes = doc.content.kind === "bytes" ? doc.content.value : null;
	const revision = doc.content.kind === "bytes" ? doc.content.revision : "";

	if (!bytes) {
		return null;
	}

	return (
		<div className="relative h-full overflow-auto bg-muted/30">
			<FormatBadge label="PDF" colorClassName="bg-rose-600 text-white" />
			{/* Remount on revision so an agent write reloads the PDF and clears state. */}
			<PdfDocument key={revision} bytes={bytes} isActive={isActive} />
		</div>
	);
}

function PdfDocument({
	bytes,
	isActive,
}: {
	bytes: Uint8Array;
	isActive: boolean;
}) {
	const shouldAnimate = useShouldAnimate();
	const [numPages, setNumPages] = useState(0);
	const [error, setError] = useState<string | null>(null);

	// Copy into a fresh ArrayBuffer — pdf.js transfers/detaches the buffer it is
	// given, which would corrupt the store's shared Uint8Array.
	const file = useMemo(() => ({ data: new Uint8Array(bytes) }), [bytes]);

	if (error) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm">
				{error}
			</div>
		);
	}

	return (
		<Document
			file={file}
			onLoadSuccess={({ numPages: n }) => setNumPages(n)}
			onLoadError={(e) => setError(e.message)}
			loading={
				<div className="flex h-full items-center justify-center p-6 text-muted-foreground text-sm">
					Loading PDF…
				</div>
			}
			className="flex flex-col items-center gap-4 p-4"
		>
			{Array.from({ length: numPages }, (_, index) => (
				<Page
					// biome-ignore lint/suspicious/noArrayIndexKey: pages are positional and static for a loaded document
					key={index}
					pageNumber={index + 1}
					renderTextLayer={false}
					renderAnnotationLayer={false}
					className={
						shouldAnimate && isActive
							? "shadow-md transition-shadow"
							: "shadow-md"
					}
					width={Math.min(900, window.innerWidth - 80)}
				/>
			))}
		</Document>
	);
}
