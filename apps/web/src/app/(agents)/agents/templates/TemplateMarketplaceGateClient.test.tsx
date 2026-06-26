import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TemplateMarketplaceGateClient } from "./TemplateMarketplaceGateClient";

/**
 * The template-marketplace surface is gated purely on the `templates.marketplace`
 * experimental feature (no org-scoped query). The feature ships `ready` with no
 * required provider, so the default-open gate renders the real catalog. This
 * pins that the client mounts the panel (not a fallback) and that the panel
 * surfaces the real shared catalog content — no faked creation engine, just the
 * browse surface with source deep-links.
 */
describe("TemplateMarketplaceGateClient", () => {
	test("renders the marketplace panel with the real catalog when the gate is open", () => {
		const html = renderToStaticMarkup(<TemplateMarketplaceGateClient />);
		// The panel heading, not the closed-gate fallback.
		expect(html).toContain("Маркетплейс шаблонов");
		expect(html).not.toContain("недоступен для текущего контекста");
		// A real catalog entry is surfaced, deep-linked to its source.
		expect(html).toContain("Next.js");
		expect(html).toContain(
			"https://github.com/vercel/nextjs-postgres-auth-starter",
		);
	});
});
