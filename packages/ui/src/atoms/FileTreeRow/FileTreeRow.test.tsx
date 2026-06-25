import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FileTreeRow } from "./FileTreeRow";

describe("FileTreeRow", () => {
	it("renders the file name", () => {
		const html = renderToStaticMarkup(
			<FileTreeRow name="app.js" isDirectory={false} />,
		);
		expect(html).toContain("app.js");
	});

	it("draws one guide-line rail per ancestor level", () => {
		const html = renderToStaticMarkup(
			<FileTreeRow name="deep.ts" isDirectory={false} depth={3} />,
		);
		// 3 levels -> 3 border-l rails.
		expect(html.match(/border-l/g)?.length ?? 0).toBe(3);
	});

	it("omits guide-lines at the root", () => {
		const html = renderToStaticMarkup(
			<FileTreeRow name="root.ts" isDirectory={false} depth={0} />,
		);
		expect(html).not.toContain("border-l");
	});

	it("renders a chevron toggle for directories and rotates it when expanded", () => {
		const collapsed = renderToStaticMarkup(
			<FileTreeRow name="src" isDirectory={true} />,
		);
		expect(collapsed).toContain("lucide-chevron-right");
		expect(collapsed).not.toContain("rotate-90");

		const expanded = renderToStaticMarkup(
			<FileTreeRow name="src" isDirectory={true} isExpanded />,
		);
		expect(expanded).toContain("rotate-90");
	});

	it("does not render a chevron for files (placeholder keeps alignment)", () => {
		const html = renderToStaticMarkup(
			<FileTreeRow name="app.js" isDirectory={false} />,
		);
		expect(html).not.toContain("lucide-chevron-right");
	});

	it("renders the trailing decoration slot when provided", () => {
		const html = renderToStaticMarkup(
			<FileTreeRow name="app.js" isDirectory={false} decoration="1.2 KB" />,
		);
		expect(html).toContain("1.2 KB");
		expect(html).toContain("tabular-nums");
	});

	it("marks the selected row", () => {
		const html = renderToStaticMarkup(
			<FileTreeRow name="app.js" isDirectory={false} isSelected />,
		);
		expect(html).toContain("data-selected");
	});
});
