// Bundle the pdf.js worker that matches react-pdf's pinned pdfjs-dist version.
// Vite's `?url` suffix emits the asset and returns its served URL, which we
// hand to pdf.js so the worker resolves correctly inside the Electron renderer.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pdfjs } from "react-pdf";

let configured = false;

/**
 * Point pdf.js at the bundled worker exactly once. Safe to call on every render.
 */
export function ensurePdfWorker(): void {
	if (configured) return;
	pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
	configured = true;
}
