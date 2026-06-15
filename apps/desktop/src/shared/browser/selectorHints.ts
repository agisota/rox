import type { CaptureSelector, RawElementDescriptor } from "./types";

const TEST_ID_ATTRS = ["data-testid", "data-test-id", "data-test", "data-cy"];

function findTestId(attributes: Record<string, string>): string | undefined {
	for (const attr of TEST_ID_ATTRS) {
		const value = attributes[attr];
		if (value) return value;
	}
	return undefined;
}

/** CSS.escape isn't available in the main process; this covers identifier chars. */
function cssEscape(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * Synthesizes a stable, human-readable CSS selector from a serialized element
 * descriptor, preferring (in order): test id, id, role, tag + class subset.
 */
export function buildCssSelector(desc: RawElementDescriptor): string {
	const tag = desc.tagName.toLowerCase();

	const testId = desc.testId ?? findTestId(desc.attributes);
	if (testId) {
		const attr = TEST_ID_ATTRS.find((a) => desc.attributes[a] === testId);
		return `${tag}[${attr ?? "data-testid"}="${testId}"]`;
	}

	if (desc.id) return `${tag}#${cssEscape(desc.id)}`;

	// Skip utility-class noise (very long class lists) to keep selectors usable;
	// take up to the first three classes.
	const classes = desc.classList
		.filter((c) => c.length > 0)
		.slice(0, 3)
		.map((c) => `.${cssEscape(c)}`)
		.join("");
	if (classes) return `${tag}${classes}`;

	if (desc.role) return `${tag}[role="${desc.role}"]`;
	return tag;
}

/** Builds an indexed XPath from the descriptor's DOM ancestry (root-first). */
export function buildXPath(desc: RawElementDescriptor): string {
	if (desc.domPath.length === 0) return `/${desc.tagName.toLowerCase()}`;
	return desc.domPath
		.map((seg) => `/${seg.tagName.toLowerCase()}[${seg.index}]`)
		.join("");
}

/**
 * Produces the full {@link CaptureSelector} hint bundle the agent receives.
 */
export function buildSelectorHints(
	desc: RawElementDescriptor,
): CaptureSelector {
	const testId = desc.testId ?? findTestId(desc.attributes);
	const textSnippet = desc.textSnippet?.trim().slice(0, 120) || undefined;
	return {
		css: buildCssSelector(desc),
		xpath: buildXPath(desc),
		textSnippet,
		role: desc.role || desc.attributes.role || undefined,
		testId,
	};
}
