import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OfflineShell } from "./OfflineShell";

describe("OfflineShell", () => {
	it("renders the default title and description", () => {
		const html = renderToStaticMarkup(<OfflineShell />);
		expect(html).toContain('data-slot="offline-shell"');
		expect(html).toContain("Нет подключения");
	});

	it("hides the pending line when no edits are queued", () => {
		const html = renderToStaticMarkup(<OfflineShell pendingCount={0} />);
		expect(html).not.toContain('data-slot="offline-pending"');
		expect(html).toContain('data-pending="false"');
	});

	it("shows queued-edit count when pending > 0", () => {
		const html = renderToStaticMarkup(<OfflineShell pendingCount={3} />);
		expect(html).toContain('data-slot="offline-pending"');
		expect(html).toContain('data-count="3"');
		expect(html).toContain("3");
	});

	it("uses a custom pending renderer when supplied", () => {
		const html = renderToStaticMarkup(
			<OfflineShell pendingCount={2} renderPending={(n) => `queued:${n}`} />,
		);
		expect(html).toContain("queued:2");
	});

	it("renders an action slot when provided", () => {
		const html = renderToStaticMarkup(
			<OfflineShell action={<button type="button">Retry</button>} />,
		);
		expect(html).toContain('data-slot="offline-action"');
		expect(html).toContain("Retry");
	});
});
