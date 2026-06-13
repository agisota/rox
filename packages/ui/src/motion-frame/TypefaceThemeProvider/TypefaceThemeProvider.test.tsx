import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	TypefaceThemeProvider,
	useTypefaceTheme,
} from "./TypefaceThemeProvider";

function Probe() {
	const { theme } = useTypefaceTheme();
	return <span data-theme={theme} />;
}

describe("TypefaceThemeProvider", () => {
	it("defaults to docs and stamps the wrapper with data-typeface", () => {
		const html = renderToStaticMarkup(
			<TypefaceThemeProvider persist={false}>
				<Probe />
			</TypefaceThemeProvider>,
		);
		expect(html).toContain('data-typeface="docs"');
		expect(html).toContain('data-theme="docs"');
	});

	it("respects defaultTheme", () => {
		const html = renderToStaticMarkup(
			<TypefaceThemeProvider defaultTheme="blueprint" persist={false}>
				<Probe />
			</TypefaceThemeProvider>,
		);
		expect(html).toContain('data-typeface="blueprint"');
	});

	it("falls back to docs outside a provider", () => {
		const html = renderToStaticMarkup(<Probe />);
		expect(html).toContain('data-theme="docs"');
	});
});
