import DOMPurify from "dompurify";

/**
 * Sanitize an inbound email's HTML body before it is rendered (FEATURE A).
 *
 * Email HTML is fully untrusted (an external sender controls it), so it is run
 * through DOMPurify, which strips scripts, event handlers, and other XSS vectors
 * while keeping ordinary formatting. We additionally:
 *   - drop `<style>` and inline `style`/`class` so a remote message cannot
 *     restyle (or hide overlays over) the app chrome;
 *   - forbid `<form>`/inputs so a message can't render a credential-phishing form;
 *   - keep images but they are confined to the sandboxed render container.
 *
 * DOMPurify needs a DOM, so this MUST run in the browser (a `"use client"`
 * component / the Electron renderer) — never during SSR. The returned string is
 * safe to inject; the caller still renders it inside an isolated, overflow-clipped
 * container so even well-formed markup can't escape the message bounds.
 */
export function sanitizeMailHtml(rawHtml: string): string {
	const clean = DOMPurify.sanitize(rawHtml, {
		FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
		FORBID_ATTR: ["style", "class", "srcset"],
		// Defense-in-depth: never emit unknown protocols on href/src.
		ALLOWED_URI_REGEXP:
			/^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
	});

	// Force every link to open in a new context with no opener access, so a
	// rendered email link can never reach back into the app window.
	return hardenLinks(clean);
}

/**
 * Add `target="_blank"` + `rel="noopener noreferrer"` to every anchor in the
 * already-sanitized HTML string. String-level rewrite (no DOM) so it is reusable
 * across web + desktop without a second parse. Exported for unit testing the
 * link-hardening logic without a DOM (DOMPurify itself needs one).
 */
export function hardenLinks(html: string): string {
	return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
		let next = attrs;
		if (!/\btarget\s*=/i.test(next)) {
			next += ' target="_blank"';
		}
		if (!/\brel\s*=/i.test(next)) {
			next += ' rel="noopener noreferrer"';
		}
		return `<a${next}>`;
	});
}
