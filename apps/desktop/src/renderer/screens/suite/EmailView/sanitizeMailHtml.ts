import DOMPurify from "dompurify";

/**
 * Sanitize an inbound email's HTML body before rendering in the Electron
 * renderer (FEATURE A). Mirrors the web `sanitizeMailHtml`: email HTML is fully
 * untrusted, so it is run through DOMPurify (strips scripts, event handlers, and
 * other XSS vectors), `<style>`/inline styles are dropped so a remote message
 * cannot restyle or overlay the app chrome, and `<form>`/inputs are forbidden so
 * a message can't render a phishing form. Links are then forced to open with no
 * opener access.
 *
 * Runs in the renderer (a DOM is present); the caller still renders the result in
 * an isolated, clipped container so even valid markup stays bounded.
 */
export function sanitizeMailHtml(rawHtml: string): string {
	const clean = DOMPurify.sanitize(rawHtml, {
		FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
		FORBID_ATTR: ["style", "class", "srcset"],
		ALLOWED_URI_REGEXP:
			/^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
	});
	return hardenLinks(clean);
}

/** Add `target="_blank"` + `rel="noopener noreferrer"` to every anchor. */
function hardenLinks(html: string): string {
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
