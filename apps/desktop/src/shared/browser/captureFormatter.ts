import type { DesignModeCapture } from "./types";

export type AgentAttachmentFile = {
	data: string; // base64
	mediaType: string;
	filename: string;
};

export type AgentAttachment = {
	content: string;
	files: AgentAttachmentFile[];
};

function renderComputedCss(computed: Record<string, string>): string {
	const lines = Object.entries(computed).map(
		([prop, value]) => `  ${prop}: ${value};`,
	);
	return lines.join("\n");
}

function renderSource(capture: DesignModeCapture): string {
	const { source } = capture;
	if (!source) return "Source: (not resolved)";
	const parts = [`- file: ${source.filePath}`];
	if (source.line != null) parts.push(`- line: ${source.line}`);
	if (source.column != null) parts.push(`- column: ${source.column}`);
	if (source.framework) parts.push(`- framework: ${source.framework}`);
	parts.push(`- confidence: ${source.confidence}`);
	return `Source:\n${parts.join("\n")}`;
}

/**
 * Renders a {@link DesignModeCapture} into the structured Markdown block the
 * agent receives (spec §7.4), plus the screenshot as an attachable file.
 *
 * The screenshot filename is referenced from the Markdown so the agent can
 * correlate the attached image with the capture.
 */
export function formatCaptureForAgent(
	capture: DesignModeCapture,
	options: {
		promptPrefix?: string;
		/**
		 * How the screenshot is referenced in the prose. `attachment` (default)
		 * pairs with the returned `files[]` for chat composers; `path` references
		 * the on-disk file for CLI agents that read by path (clipboard hand-off).
		 */
		screenshotRef?: "attachment" | "path";
	} = {},
): AgentAttachment {
	const filename = `design-capture-${capture.id}.png`;
	const selectorLine =
		capture.selector.css ?? capture.selector.xpath ?? "(unknown)";
	const screenshotRef = options.screenshotRef ?? "attachment";

	const sections: string[] = [];
	if (options.promptPrefix?.trim()) sections.push(options.promptPrefix.trim());

	sections.push(
		"## Selected UI element from Rox Design Mode",
		[
			`URL: ${capture.url}`,
			capture.title ? `Title: ${capture.title}` : null,
			`Viewport: ${capture.bounds.viewportWidth}×${capture.bounds.viewportHeight} @ ${capture.bounds.deviceScaleFactor}x`,
			`Device: ${capture.devicePresetId}`,
			`Selector: ${selectorLine}`,
		]
			.filter(Boolean)
			.join("\n"),
		renderSource(capture),
		`HTML:\n\`\`\`html\n${capture.html.outerHTML}\n\`\`\``,
		`Computed CSS:\n\`\`\`css\n${selectorLine} {\n${renderComputedCss(
			capture.styles.computed,
		)}\n}\n\`\`\``,
		screenshotRef === "path"
			? `Screenshot: ${capture.screenshot.path}`
			: `Screenshot: ${filename} (attached)`,
	);

	return {
		content: sections.join("\n\n"),
		files: [
			{
				data: capture.screenshot.data,
				mediaType: capture.screenshot.mimeType,
				filename,
			},
		],
	};
}
