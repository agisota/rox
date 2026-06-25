import { describe, expect, test } from "bun:test";

const globalsCss = await Bun.file(
	new URL("./globals.css", import.meta.url),
).text();

/**
 * Returns the body of a single top-level `selector { ... }` block from the
 * stylesheet text. Brace-counting keeps nested blocks (e.g. `@layer base`'s
 * inner `:root`) from terminating the match early, so we always isolate the
 * FIRST matching block — which for `:root` / `.dark` is the canonical token
 * declaration block at the top of the file.
 */
function extractBlock(css: string, selector: string): string {
	const start = css.indexOf(`${selector} {`);
	if (start === -1) {
		throw new Error(`selector not found: ${selector}`);
	}
	const open = css.indexOf("{", start);
	let depth = 0;
	for (let i = open; i < css.length; i++) {
		const char = css[i];
		if (char === "{") {
			depth++;
		} else if (char === "}") {
			depth--;
			if (depth === 0) {
				return css.slice(open + 1, i);
			}
		}
	}
	throw new Error(`unterminated block for selector: ${selector}`);
}

const SEMANTIC_TOKENS = ["info", "success", "warning"] as const;

describe("globals.css semantic tokens", () => {
	const rootBlock = extractBlock(globalsCss, ":root");
	const darkBlock = extractBlock(globalsCss, ".dark");

	for (const token of SEMANTIC_TOKENS) {
		describe(`--${token}`, () => {
			test("declared in :root with a foreground pair", () => {
				expect(rootBlock).toContain(`--${token}:`);
				expect(rootBlock).toContain(`--${token}-foreground:`);
			});

			test("declared in .dark with a foreground pair", () => {
				expect(darkBlock).toContain(`--${token}:`);
				expect(darkBlock).toContain(`--${token}-foreground:`);
			});

			test("uses OKLCH values in both themes", () => {
				expect(rootBlock).toMatch(new RegExp(`--${token}:\\s*oklch\\(`));
				expect(darkBlock).toMatch(new RegExp(`--${token}:\\s*oklch\\(`));
			});

			test("registered in the @theme inline color map", () => {
				expect(globalsCss).toContain(`--color-${token}: var(--${token});`);
				expect(globalsCss).toContain(
					`--color-${token}-foreground: var(--${token}-foreground);`,
				);
			});
		});
	}
});
