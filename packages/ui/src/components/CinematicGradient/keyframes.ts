/**
 * Self-contained styles for {@link CinematicGradient} (custom-loading-screens
 * epic). Injected once into <head> on the client so the shared @rox/ui
 * component works identically on web (imports `@rox/ui/globals.css`) and the
 * desktop renderer (a hand-mirrored globals.css that does NOT import ours) —
 * neither app has to register these keyframes, and they can't drift apart.
 */

const STYLE_ID = "rox-cinematic-keyframes";

/** Transform/opacity-only keyframes — cheap to composite, no layout thrash. */
const KEYFRAMES = `
@keyframes rox-cine-drift-a {
	0%, 100% { transform: translate3d(0, 0, 0); }
	50% { transform: translate3d(6%, -4%, 0); }
}
@keyframes rox-cine-drift-b {
	0%, 100% { transform: translate3d(0, 0, 0); }
	50% { transform: translate3d(-5%, 5%, 0); }
}
@keyframes rox-cine-sway {
	0%, 100% { transform: translateX(-4%) skewX(-6deg); opacity: 0.45; }
	50% { transform: translateX(4%) skewX(4deg); opacity: 0.8; }
}
@keyframes rox-cine-spin {
	from { transform: rotate(0deg) scale(1.05); }
	to { transform: rotate(360deg) scale(1.05); }
}
@keyframes rox-cine-pulse {
	0%, 100% { opacity: 0.45; }
	50% { opacity: 0.8; }
}
`;

let injected = false;

/**
 * Inject the cinematic keyframes into <head> exactly once. No-ops on the server
 * (no `document`) and after the first call. Safe to invoke from every instance.
 */
export function ensureCinematicStyles(): void {
	if (injected || typeof document === "undefined") return;
	injected = true;
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = KEYFRAMES;
	document.head.appendChild(style);
}

/**
 * Tiny tiled film-grain texture as an inline SVG data URI. Layered at low
 * opacity with `mix-blend-mode: overlay` to break up gradient banding and add a
 * cinematic, photographic feel. Zero network cost.
 */
export const GRAIN_DATA_URI =
	"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
