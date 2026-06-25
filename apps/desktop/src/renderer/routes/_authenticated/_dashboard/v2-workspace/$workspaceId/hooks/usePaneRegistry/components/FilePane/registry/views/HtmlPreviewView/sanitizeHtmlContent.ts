import DOMPurify from "dompurify";

/**
 * Sanitize untrusted HTML file content before previewing it. Mirrors the proven
 * mail sanitizer (`sanitizeMailHtml`): DOMPurify strips scripts, event handlers,
 * and other XSS vectors. Unlike mail, file previews keep inline `style`/`class`
 * so authored layout survives, but `<form>`/inputs and event handlers are still
 * forbidden. The caller additionally renders the result inside a sandboxed
 * iframe with no `allow-scripts`, so even a DOMPurify bypass cannot execute.
 */
export function sanitizeHtmlContent(rawHtml: string): string {
	return DOMPurify.sanitize(rawHtml, {
		FORBID_TAGS: ["script", "form", "input", "button", "textarea", "select"],
		FORBID_ATTR: ["srcset"],
		ALLOWED_URI_REGEXP:
			/^(?:(?:https?|mailto|tel|cid|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
	});
}
