import { useMemo } from "react";
import type { ViewProps } from "../../types";
import { FormatBadge } from "../components/FormatBadge";
import { sanitizeHtmlContent } from "./sanitizeHtmlContent";

/**
 * Sanitized HTML preview. Defense in depth: the content is first run through
 * DOMPurify (`sanitizeHtmlContent`) and then rendered inside a sandboxed iframe
 * with no `allow-scripts`, so previewed files can never execute JavaScript or
 * reach the app chrome.
 */
export function HtmlPreviewView({ document: doc }: ViewProps) {
	const text = doc.content.kind === "text" ? doc.content.value : null;

	const sanitized = useMemo(
		() => (text === null ? null : sanitizeHtmlContent(text)),
		[text],
	);

	if (sanitized === null) {
		return null;
	}

	return (
		<div className="relative h-full bg-white">
			<FormatBadge label="HTML" colorClassName="bg-orange-600 text-white" />
			<iframe
				title="HTML preview"
				// No allow-scripts / allow-same-origin: the frame is inert and
				// cross-origin to the app, on top of the DOMPurify pass above.
				sandbox=""
				srcDoc={sanitized}
				className="h-full w-full border-0"
			/>
		</div>
	);
}
