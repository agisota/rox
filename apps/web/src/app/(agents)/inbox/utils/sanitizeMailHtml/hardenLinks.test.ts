import { describe, expect, test } from "bun:test";

import { hardenLinks } from "./sanitizeMailHtml";

/**
 * Link hardening (FEATURE A): every anchor in a sanitized email body must open in
 * a new context with no opener access, so a rendered link can't reach back into
 * the app window. This is the DOM-free part of `sanitizeMailHtml` (DOMPurify
 * itself needs a DOM), so it is unit-tested directly.
 */
describe("hardenLinks", () => {
	test("adds target=_blank and rel=noopener noreferrer to a bare anchor", () => {
		const out = hardenLinks('<a href="https://example.com">x</a>');
		expect(out).toContain('target="_blank"');
		expect(out).toContain('rel="noopener noreferrer"');
		expect(out).toContain('href="https://example.com"');
	});

	test("does not duplicate an existing target/rel", () => {
		const input = '<a href="https://e.com" target="_self" rel="nofollow">x</a>';
		const out = hardenLinks(input);
		// Preserves the author's explicit target/rel rather than appending a 2nd.
		expect(out.match(/target=/g)).toHaveLength(1);
		expect(out.match(/rel=/g)).toHaveLength(1);
		expect(out).toContain('target="_self"');
		expect(out).toContain('rel="nofollow"');
	});

	test("hardens multiple anchors", () => {
		const out = hardenLinks(
			'<a href="https://a.com">a</a><p>mid</p><a href="https://b.com">b</a>',
		);
		expect(out.match(/target="_blank"/g)).toHaveLength(2);
	});

	test("leaves anchorless html untouched", () => {
		const input = "<p>no links here</p><img src='https://x/y.png'/>";
		expect(hardenLinks(input)).toBe(input);
	});
});
