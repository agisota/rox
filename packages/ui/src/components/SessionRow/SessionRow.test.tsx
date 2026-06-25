import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SessionRow } from "./SessionRow";
import type { SessionRowData } from "./session-row";

const BASE: SessionRowData = {
	sessionId: "s1",
	title: "Refactor auth",
	isCurrent: false,
};

describe("SessionRow", () => {
	it("renders the title and the session id marker", () => {
		const html = renderToStaticMarkup(
			<SessionRow data={BASE} onSelect={() => {}} />,
		);
		expect(html).toContain("Refactor auth");
		expect(html).toContain('data-session-id="s1"');
		expect(html).toContain('data-density="compact"');
	});

	it("renders title #tag chips when onSelectTag + titleSegments are given (F13)", () => {
		const html = renderToStaticMarkup(
			<SessionRow
				data={{
					...BASE,
					title: "plan #q3",
					titleSegments: [
						{ kind: "text", text: "plan " },
						{ kind: "tag", text: "#q3", tag: "q3" },
					],
				}}
				onSelect={() => {}}
				onSelectTag={() => {}}
			/>,
		);
		expect(html).toContain('data-chip-tag="q3"');
		expect(html).toContain("#q3");
	});

	it("renders the plain title (no chips) without an onSelectTag handler", () => {
		const html = renderToStaticMarkup(
			<SessionRow
				data={{
					...BASE,
					title: "plan #q3",
					titleSegments: [
						{ kind: "text", text: "plan " },
						{ kind: "tag", text: "#q3", tag: "q3" },
					],
				}}
				onSelect={() => {}}
			/>,
		);
		expect(html).toContain("plan #q3");
		expect(html).not.toContain("data-chip-tag");
	});

	it("falls back to the empty-title label for a blank title", () => {
		const html = renderToStaticMarkup(
			<SessionRow
				data={{ ...BASE, title: "" }}
				onSelect={() => {}}
				emptyTitleLabel="Новый чат"
			/>,
		);
		expect(html).toContain("Новый чат");
	});

	it("renders a colour dot from the label colour (F12)", () => {
		const html = renderToStaticMarkup(
			<SessionRow
				data={{ ...BASE, labels: [{ name: "Bug", color: "rgb(1, 2, 3)" }] }}
				onSelect={() => {}}
			/>,
		);
		expect(html).toContain("rgb(1, 2, 3)");
	});

	it("renders a pin affordance only when onSetPinned is provided", () => {
		const without = renderToStaticMarkup(
			<SessionRow data={BASE} onSelect={() => {}} deleteLabel="Del" />,
		);
		expect(without).not.toContain('aria-label="Pin"');

		const withPin = renderToStaticMarkup(
			<SessionRow
				data={BASE}
				onSelect={() => {}}
				onSetPinned={() => {}}
				pinLabel="Закрепить"
			/>,
		);
		expect(withPin).toContain("Закрепить");
	});

	it("hides delete for the current session", () => {
		const current = renderToStaticMarkup(
			<SessionRow
				data={{ ...BASE, isCurrent: true }}
				onSelect={() => {}}
				onDelete={() => {}}
				deleteLabel="Удалить"
			/>,
		);
		expect(current).not.toContain('aria-label="Удалить"');

		const other = renderToStaticMarkup(
			<SessionRow
				data={BASE}
				onSelect={() => {}}
				onDelete={() => {}}
				deleteLabel="Удалить"
			/>,
		);
		expect(other).toContain('aria-label="Удалить"');
	});

	it("renders the worktree/branch meta row only in detailed density", () => {
		const detailed = renderToStaticMarkup(
			<SessionRow
				data={{ ...BASE, branch: "feat/x", worktree: "wt-1" }}
				density="detailed"
				onSelect={() => {}}
			/>,
		);
		expect(detailed).toContain("feat/x");
		expect(detailed).toContain("wt-1");
		expect(detailed).toContain('data-density="detailed"');

		const compact = renderToStaticMarkup(
			<SessionRow
				data={{ ...BASE, branch: "feat/x", worktree: "wt-1" }}
				onSelect={() => {}}
			/>,
		);
		expect(compact).not.toContain("feat/x");
	});
});
