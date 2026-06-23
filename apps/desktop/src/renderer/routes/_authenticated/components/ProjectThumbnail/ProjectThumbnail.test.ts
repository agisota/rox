import { describe, expect, test } from "bun:test";
import { resolveProjectThumbnailDisplay } from "./ProjectThumbnail";

// Representative of the self-contained pizdariki icon URL the @rox/db seed
// writes into v2_projects.icon_url for the demo project (issue #26). Kept inline
// (rather than importing @rox/db/seed-demo-project) so this renderer unit test
// stays hermetic — that module pulls in the Neon DB client at load. The exact
// seeded value is asserted in packages/db/src/seed-demo-project.test.ts; here we
// only prove the renderer resolves a data:image/svg+xml URL to an <img> icon.
const DEMO_ICON_DATA_URL =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IGZpbGw9IiNmYWNjMTUiIC8+PC9zdmc+";

describe("resolveProjectThumbnailDisplay", () => {
	test("renders the demo project's pizdariki data: URL as an icon", () => {
		// The URL the @rox/db seed writes into v2_projects.icon_url is rendered as
		// an <img src> by the live dashboard ProjectThumbnail (yellow pizdariki).
		const display = resolveProjectThumbnailDisplay({
			projectName: "Demo Project",
			iconUrl: DEMO_ICON_DATA_URL,
			failedUrl: null,
		});

		expect(display).toEqual({ kind: "icon", src: DEMO_ICON_DATA_URL });
		expect(DEMO_ICON_DATA_URL.startsWith("data:image/svg+xml;base64,")).toBe(
			true,
		);
	});

	test("renders an https:// icon URL as an icon", () => {
		const display = resolveProjectThumbnailDisplay({
			projectName: "Acme",
			iconUrl: "https://example.com/icon.png",
			failedUrl: null,
		});

		expect(display).toEqual({
			kind: "icon",
			src: "https://example.com/icon.png",
		});
	});

	test("renders a rox-icon:// custom-protocol URL as an icon", () => {
		const url = "rox-icon://projects/abc?v=1";
		const display = resolveProjectThumbnailDisplay({
			projectName: "Acme",
			iconUrl: url,
			failedUrl: null,
		});

		expect(display).toEqual({ kind: "icon", src: url });
	});

	test("falls back to the uppercased first letter when iconUrl is null", () => {
		const display = resolveProjectThumbnailDisplay({
			projectName: "demo project",
			iconUrl: null,
			failedUrl: null,
		});

		expect(display).toEqual({ kind: "fallback", letter: "D" });
	});

	test("falls back to the first letter when iconUrl is undefined", () => {
		const display = resolveProjectThumbnailDisplay({
			projectName: "Workspace",
			iconUrl: undefined,
			failedUrl: null,
		});

		expect(display).toEqual({ kind: "fallback", letter: "W" });
	});

	test("falls back to the first letter when the icon URL previously errored", () => {
		// onError records the failed URL; a re-render with the same URL must not
		// retry the broken <img> and should show the letter instead.
		const display = resolveProjectThumbnailDisplay({
			projectName: "Demo Project",
			iconUrl: DEMO_ICON_DATA_URL,
			failedUrl: DEMO_ICON_DATA_URL,
		});

		expect(display).toEqual({ kind: "fallback", letter: "D" });
	});

	test("still renders a fresh icon URL after a different URL had errored", () => {
		const display = resolveProjectThumbnailDisplay({
			projectName: "Acme",
			iconUrl: "https://example.com/new.png",
			failedUrl: "https://example.com/old.png",
		});

		expect(display).toEqual({
			kind: "icon",
			src: "https://example.com/new.png",
		});
	});
});
