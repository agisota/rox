import { describe, expect, it } from "bun:test";
import type { MessageSearchResult } from "@rox/shared/search";
import { renderToStaticMarkup } from "react-dom/server";

import { MessageSearchBox, type MessageTitleMatch } from "./MessageSearchBox";

const TITLE_MATCHES: MessageTitleMatch[] = [
	{ id: "t1", title: "Deploy the staging API", subtitle: "вы" },
];

const CONTENT_RESULTS: MessageSearchResult[] = [
	{
		id: "c1",
		sessionId: "s1",
		role: "assistant",
		title: "Rolling out the deploy",
		snippet: "we [[hl]]deploy[[/hl]] every friday",
		score: 0.5,
		createdAt: "2026-01-01T00:00:00.000Z",
	},
];

const render = (
	overrides: Partial<Parameters<typeof MessageSearchBox>[0]> = {},
) =>
	renderToStaticMarkup(
		<MessageSearchBox
			query="deploy"
			onQueryChange={() => {}}
			titleMatches={TITLE_MATCHES}
			contentResults={CONTENT_RESULTS}
			{...overrides}
		/>,
	);

describe("MessageSearchBox", () => {
	it("renders the search input with the controlled query", () => {
		const html = render();
		expect(html).toContain('type="search"');
		expect(html).toContain('value="deploy"');
	});

	it("highlights the instant title match term in a <mark>", () => {
		const html = render();
		// the matched substring is wrapped in <mark>, the rest is plain text
		expect(html).toContain("<mark");
		expect(html).toContain("Deploy");
		expect(html).toContain("box-decoration-clone");
	});

	it("renders the backend snippet with the [[hl]] sentinels marked", () => {
		const html = render();
		expect(html).toContain("we ");
		expect(html).toContain("every friday");
		// the sentinel itself must NOT leak into the output
		expect(html).not.toContain("[[hl]]");
		expect(html).not.toContain("[[/hl]]");
	});

	it("shows the empty label when a query matches nothing and not searching", () => {
		const html = render({
			titleMatches: [],
			contentResults: [],
			isSearching: false,
			emptyLabel: "Пусто",
		});
		expect(html).toContain("Пусто");
	});

	it("does not render result lanes for an empty query", () => {
		const html = render({ query: "  " });
		expect(html).not.toContain("Совпадения в списке");
		expect(html).not.toContain("Совпадения в тексте");
	});
});
