import type { FileView } from "./types";
import { binaryWarningView } from "./views/BinaryWarningView";
import { codeView } from "./views/CodeView";
import { csvView } from "./views/CsvView";
import { htmlPreviewView } from "./views/HtmlPreviewView";
import { imageView } from "./views/ImageView";
import { markdownPreviewView } from "./views/MarkdownPreviewView";
import { pdfView } from "./views/PdfView";

// Order is preserved as a stable tiebreaker for equal-priority views.
// Exclusives (image, pdf, binary-warning) short-circuit resolution when matched.
export const ALL_VIEWS: FileView[] = [
	imageView,
	pdfView,
	binaryWarningView,
	htmlPreviewView,
	csvView,
	markdownPreviewView,
	codeView,
];
