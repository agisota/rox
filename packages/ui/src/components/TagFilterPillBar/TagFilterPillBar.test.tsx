import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TagFilterPillBar } from "./TagFilterPillBar";
import { ALL_TAGS_FILTER, type TagLabel } from "./tag-filter";

const BUG: TagLabel = { id: "a", name: "Bug", color: "hsl(10, 58%, 46%)" };
const IDEA: TagLabel = { id: "b", name: "Idea" };
const LABELS: TagLabel[] = [BUG, IDEA];

describe("TagFilterPillBar", () => {
	it("renders an All pill, a dashed Unassigned, and one pill per label", () => {
		const html = renderToStaticMarkup(
			<TagFilterPillBar
				labels={LABELS}
				filter={ALL_TAGS_FILTER}
				onSelectPill={() => {}}
			/>,
		);
		expect(html).toContain('data-pill="all"');
		expect(html).toContain('data-pill="unassigned"');
		expect(html).toContain('data-pill="label:a"');
		expect(html).toContain('data-pill="label:b"');
		expect(html).toContain("Bug");
		expect(html).toContain("Idea");
	});

	it("renders the colour dot from the label colour", () => {
		const html = renderToStaticMarkup(
			<TagFilterPillBar
				labels={[BUG]}
				filter={ALL_TAGS_FILTER}
				onSelectPill={() => {}}
			/>,
		);
		expect(html).toContain("hsl(10, 58%, 46%)");
	});

	it("renders the create pill only when onCreateLabel is provided", () => {
		const without = renderToStaticMarkup(
			<TagFilterPillBar
				labels={LABELS}
				filter={ALL_TAGS_FILTER}
				onSelectPill={() => {}}
			/>,
		);
		expect(without).not.toContain('aria-label="Create label"');

		const withCreate = renderToStaticMarkup(
			<TagFilterPillBar
				labels={LABELS}
				filter={ALL_TAGS_FILTER}
				onSelectPill={() => {}}
				onCreateLabel={() => {}}
			/>,
		);
		expect(withCreate).toContain('aria-label="Create label"');
	});
});
