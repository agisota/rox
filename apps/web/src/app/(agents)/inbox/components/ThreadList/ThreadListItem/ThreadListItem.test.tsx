import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ThreadListItem } from "./ThreadListItem";

/**
 * I6/E — the inbox row renders an unread-count badge when the caller has unread
 * messages and nothing when caught up. The component is a pure presentational
 * button (no hooks/tRPC/env), so we assert its SSR markup directly via
 * `renderToStaticMarkup` (the established web pattern, no DOM harness needed).
 * The `onSelect` handler is never invoked under SSR.
 */
const baseProps = {
	id: "t-1",
	subject: "Hello",
	lastMessageAt: null,
	isActive: false,
	onSelect: () => {},
};

describe("ThreadListItem unread badge", () => {
	test("renders the count badge when unreadCount > 0", () => {
		const html = renderToStaticMarkup(
			<ThreadListItem {...baseProps} unreadCount={3} />,
		);
		expect(html).toContain('data-slot="badge"');
		expect(html).toContain(">3<");
		// Unread rows lift the subject weight to semibold.
		expect(html).toContain("font-semibold");
	});

	test("renders no badge when unreadCount is 0", () => {
		const html = renderToStaticMarkup(
			<ThreadListItem {...baseProps} unreadCount={0} />,
		);
		expect(html).not.toContain('data-slot="badge"');
		expect(html).toContain("font-medium");
	});

	test("renders no badge when unreadCount is undefined", () => {
		const html = renderToStaticMarkup(<ThreadListItem {...baseProps} />);
		expect(html).not.toContain('data-slot="badge"');
	});

	test("caps the displayed count at 99+", () => {
		const html = renderToStaticMarkup(
			<ThreadListItem {...baseProps} unreadCount={150} />,
		);
		expect(html).toContain("99+");
		expect(html).not.toContain(">150<");
	});
});
