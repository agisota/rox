import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HashtagTitle } from "./HashtagTitle";
import type { HashtagTitleSegment } from "./hashtag-title";

const SEGMENTS: HashtagTitleSegment[] = [
	{ kind: "text", text: "plan " },
	{ kind: "tag", text: "#q3", tag: "q3" },
	{ kind: "text", text: " launch" },
];

describe("HashtagTitle", () => {
	it("renders text runs verbatim and tags as chips", () => {
		const html = renderToStaticMarkup(
			<HashtagTitle segments={SEGMENTS} onSelectTag={() => {}} />,
		);
		expect(html).toContain("plan ");
		expect(html).toContain(" launch");
		expect(html).toContain('data-chip-tag="q3"');
		expect(html).toContain("#q3");
	});

	it("renders inert (non-button) chips when no handler is given", () => {
		const html = renderToStaticMarkup(<HashtagTitle segments={SEGMENTS} />);
		expect(html).toContain('data-chip-tag="q3"');
		expect(html).not.toContain("<button");
	});

	it("renders clickable chips when onSelectTag is given", () => {
		const html = renderToStaticMarkup(
			<HashtagTitle segments={SEGMENTS} onSelectTag={() => {}} />,
		);
		expect(html).toContain("<button");
		expect(html).toContain('aria-pressed="false"');
	});

	it("accent-fills the active tag", () => {
		const html = renderToStaticMarkup(
			<HashtagTitle
				segments={SEGMENTS}
				onSelectTag={() => {}}
				activeTags={["q3"]}
			/>,
		);
		expect(html).toContain('aria-pressed="true"');
	});

	it("renders nothing tag-like for a plain title", () => {
		const html = renderToStaticMarkup(
			<HashtagTitle
				segments={[{ kind: "text", text: "just a title" }]}
				onSelectTag={() => {}}
			/>,
		);
		expect(html).toContain("just a title");
		expect(html).not.toContain("data-chip-tag");
	});
});
