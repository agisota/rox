import type { MetadataRoute } from "next";

/**
 * Web App Manifest (F50, Hermes-borrow #645) — makes the web app installable as
 * a standalone PWA (Chrome/Edge "Install app", iOS Safari "Add to Home Screen").
 *
 * Next.js serves this typed route at `/manifest.webmanifest` and links it from
 * the document head automatically. The `theme_color`/`background_color` here are
 * the SSR first-paint values that match the dark, forced theme used app-wide
 * (`Providers` pins `forcedTheme="dark"`, and `layout.tsx` viewport sets the
 * dark `theme-color` to black). Once F09 lands its live `<meta name="theme-color">`
 * MutationObserver, the *running* chrome color tracks the resolved token; this
 * static value remains the install-time / pre-hydration fallback.
 *
 * `display_override` prefers `window-controls-overlay` (desktop installs get an
 * edge-to-edge title bar) and degrades to plain `standalone` everywhere else.
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Rox",
		short_name: "Rox",
		description:
			"Запускайте 10+ параллельных агентов для разработки на своём компьютере",
		id: "/",
		start_url: "/",
		scope: "/",
		display: "standalone",
		display_override: ["window-controls-overlay", "standalone"],
		orientation: "any",
		lang: "ru",
		dir: "ltr",
		theme_color: "#000000",
		background_color: "#000000",
		categories: ["productivity", "developer", "utilities"],
		icons: [
			{
				src: "/favicon-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any",
			},
			{
				// `apple-touch-icon.png` is a 180×180 full-bleed icon — declaring it
				// `maskable` lets Android/Chrome apply its adaptive-icon mask without a
				// transparent halo. Browsers pick the closest size, so it doubles as
				// the maskable source until a dedicated asset exists.
				src: "/apple-touch-icon.png",
				sizes: "180x180",
				type: "image/png",
				purpose: "maskable",
			},
		],
		shortcuts: [
			{
				name: "Рабочие пространства",
				short_name: "Пространства",
				description: "Открыть список рабочих пространств",
				url: "/workspaces",
			},
			{
				name: "Задачи",
				short_name: "Задачи",
				description: "Открыть задачи",
				url: "/tasks",
			},
		],
	};
}
