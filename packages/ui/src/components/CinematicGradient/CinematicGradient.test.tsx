import { describe, expect, it } from "bun:test";
import type { WallpaperScene } from "@rox/shared/appearance";
import { renderToStaticMarkup } from "react-dom/server";
import { CinematicGradient } from "./CinematicGradient";

const PALETTE = ["#0b1026", "#13294b", "#1f6f6f", "#0b1026"] as const;
const SCENES: WallpaperScene[] = [
	"aurora",
	"nebula",
	"dunes",
	"horizon",
	"calm",
];

describe("CinematicGradient", () => {
	it("renders every scene without throwing", () => {
		for (const scene of SCENES) {
			const html = renderToStaticMarkup(
				<CinematicGradient colors={PALETTE} scene={scene} tone="dark" />,
			);
			expect(html.length).toBeGreaterThan(0);
		}
	});

	it("exposes the palette as --cine-* custom properties for scene layers", () => {
		const html = renderToStaticMarkup(
			<CinematicGradient colors={PALETTE} scene="aurora" tone="dark" />,
		);
		expect(html).toContain("--cine-1:#0b1026");
		expect(html).toContain("--cine-3:#1f6f6f");
	});

	it("layers the base mesh canvas plus the film-grain overlay", () => {
		const html = renderToStaticMarkup(
			<CinematicGradient colors={PALETTE} scene="calm" tone="dark" />,
		);
		// Base animated mesh renders a <canvas>; grain is an inline SVG data URI.
		expect(html).toContain("<canvas");
		expect(html).toContain("data:image/svg+xml");
	});

	it("defaults to the calm scene when none is given", () => {
		const html = renderToStaticMarkup(<CinematicGradient colors={PALETTE} />);
		expect(html).toContain("<canvas");
	});
});
