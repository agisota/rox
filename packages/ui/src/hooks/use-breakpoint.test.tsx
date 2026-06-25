import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useBreakpoint, useCascadeRules } from "./use-breakpoint";
import { useIsMobile } from "./use-mobile";

function BreakpointProbe() {
	const tier = useBreakpoint();
	const cascade = useCascadeRules();
	const isMobile = useIsMobile();
	return (
		<i
			data-tier={tier}
			data-sidebar={cascade.sidebar}
			data-right-panel={cascade.rightPanel}
			data-composer={cascade.composer}
			data-rail-hamburger={String(cascade.railAsHamburger)}
			data-mobile={String(isMobile)}
		/>
	);
}

describe("useBreakpoint (SSR / pre-measure)", () => {
	// With no `window`, the shared core resolves the widest tier so the shell
	// renders fully docked first and only collapses once a real width arrives.
	const html = renderToStaticMarkup(<BreakpointProbe />);

	it("defaults to the wide tier with a docked shell", () => {
		expect(html).toContain('data-tier="wide"');
		expect(html).toContain('data-sidebar="docked"');
		expect(html).toContain('data-right-panel="docked"');
		expect(html).toContain('data-composer="chips"');
		expect(html).toContain('data-rail-hamburger="false"');
	});

	it("reports not-mobile on the wide tier (useIsMobile back-compat)", () => {
		expect(html).toContain('data-mobile="false"');
	});
});
