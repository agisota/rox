import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../MotionFrameProvider";
import { TypefaceThemeProvider } from "../TypefaceThemeProvider";
import { TypefaceThemeSwitcher } from "./TypefaceThemeSwitcher";

describe("TypefaceThemeSwitcher", () => {
	it("renders three radios with the active theme checked", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<TypefaceThemeProvider defaultTheme="brutalist" persist={false}>
					<TypefaceThemeSwitcher />
				</TypefaceThemeProvider>
			</MotionFrameProvider>,
		);
		expect(html).toContain(">Blueprint<");
		expect(html).toContain(">Brutalist<");
		expect(html).toContain(">Docs<");
		expect(html.match(/type="radio"/g) ?? []).toHaveLength(3);
		const checked = html.match(/<input[^>]*value="brutalist"[^>]*>/)?.[0] ?? "";
		expect(checked).toContain('checked=""');
	});

	it("keeps the highlight static when motion is off", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off" persist={false}>
				<TypefaceThemeProvider persist={false}>
					<TypefaceThemeSwitcher />
				</TypefaceThemeProvider>
			</MotionFrameProvider>,
		);
		expect(html).toContain('data-theme-pill="static"');
		expect(html).not.toContain('data-theme-pill="animated"');
	});

	it("isolates instances: two switchers never share a radio-group name", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<TypefaceThemeProvider persist={false}>
					<TypefaceThemeSwitcher />
					<TypefaceThemeSwitcher />
				</TypefaceThemeProvider>
			</MotionFrameProvider>,
		);
		const names = new Set(
			[...html.matchAll(/name="(typeface-theme-[^"]+)"/g)].map((m) => m[1]),
		);
		expect(names.size).toBe(2);
	});
});
