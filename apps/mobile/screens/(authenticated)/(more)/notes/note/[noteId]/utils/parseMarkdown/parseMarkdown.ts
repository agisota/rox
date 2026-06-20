/**
 * Minimal block-level markdown parser for the read-only note view. Splits the
 * document into typed blocks (heading levels, bullet list items, plain
 * paragraphs) so the renderer can apply native text styles without pulling in a
 * full markdown engine. Inline markup is left as-is (P0 read view); rich inline
 * rendering is deferred. Pure + deterministic so it is unit-testable.
 */

export type MarkdownBlock =
	| { kind: "heading"; level: 1 | 2 | 3; text: string }
	| { kind: "bullet"; text: string }
	| { kind: "paragraph"; text: string };

export function parseMarkdown(markdown: string): MarkdownBlock[] {
	const blocks: MarkdownBlock[] = [];
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		if (line.trim().length === 0) continue;

		const heading = /^(#{1,3})\s+(.*)$/.exec(line);
		if (heading) {
			const level = heading[1]?.length as 1 | 2 | 3;
			blocks.push({ kind: "heading", level, text: heading[2]?.trim() ?? "" });
			continue;
		}

		const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
		if (bullet) {
			blocks.push({ kind: "bullet", text: bullet[1]?.trim() ?? "" });
			continue;
		}

		blocks.push({ kind: "paragraph", text: line.trim() });
	}

	return blocks;
}
