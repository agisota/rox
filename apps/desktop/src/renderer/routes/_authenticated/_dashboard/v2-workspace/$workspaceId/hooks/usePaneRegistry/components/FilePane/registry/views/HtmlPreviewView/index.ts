import { isHtmlFile } from "shared/file-types";
import type { FileView } from "../../types";
import { HtmlPreviewView } from "./HtmlPreviewView";

export const htmlPreviewView: FileView = {
	id: "html-preview",
	label: "Preview",
	match: (filePath) => isHtmlFile(filePath),
	priority: "default",
	documentKind: "text",
	Renderer: HtmlPreviewView,
};
