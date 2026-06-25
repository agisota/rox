/**
 * Pre-hydration first-paint stamp (Hermes-borrow F06).
 *
 * The web `AppearanceProvider` applies the glass look (the `.glass` root class +
 * `--surface-opacity` / `--backdrop-blur`) inside a post-mount effect, so the
 * very first paint renders *without* glass and then snaps to it once the client
 * hydrates — a visible flash (FOUC). The fix is a tiny blocking `<script>` in
 * the document `<head>` that re-applies the persisted glass stamp synchronously,
 * before the browser paints, exactly the way next-themes stamps the resolved
 * theme class.
 *
 * The *what to stamp* contract lives here, shared, so the inline script and the
 * runtime {@link applyGlass} reader can never drift: both read the same
 * `localStorage` key and write the same root class + CSS variables. Injection is
 * web-specific (desktop already paints flicker-free from synchronous main-process
 * state, mobile from a native launch screen), but the key/var names are the one
 * cross-platform source of truth.
 *
 * See `plans/2026-06-16-custom-loading-screens-and-glass.md`.
 */

/** localStorage key holding the JSON-serialized appearance settings (web). */
export const APPEARANCE_STORAGE_KEY = "rox-appearance";

/** Root class toggled when translucent glass surfaces are enabled. */
export const GLASS_ROOT_CLASS = "glass";

/** CSS custom property carrying the resolved surface opacity (0.2–1). */
export const SURFACE_OPACITY_VAR = "--surface-opacity";

/** CSS custom property carrying the backdrop blur radius. */
export const BACKDROP_BLUR_VAR = "--backdrop-blur";

/** Backdrop blur radius (px) applied when glass is enabled on web. */
export const BACKDROP_BLUR_PX = 24;

/** Inclusive bounds for the surface opacity, mirrored from the settings clamp. */
const MIN_SURFACE_OPACITY = 0.2;
const MAX_SURFACE_OPACITY = 1;

/**
 * Inline-script body that synchronously re-applies the persisted glass stamp to
 * `document.documentElement` before first paint. Returns the raw JS source for a
 * blocking `<script>` (no `<script>` tags, no IIFE wrapper — the caller decides
 * how to embed it; on web that is Next.js `<Script strategy="beforeInteractive">`
 * or an inline `dangerouslySetInnerHTML`).
 *
 * The body is defensive end-to-end: it swallows every error (private-mode /
 * disabled storage, malformed blobs) so a storage failure can never block paint,
 * and clamps opacity into the same 0.2–1 range as {@link clampWindowOpacity}.
 * Re-running it is idempotent, which is exactly what the bfcache `pageshow`
 * resync relies on.
 *
 * The constants are interpolated (not hard-coded) so this string and the runtime
 * `applyGlass` stay locked to the same key/var/blur contract.
 */
export function buildFirstPaintScript(): string {
	return `(function(){try{
var raw=localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)});
if(!raw)return;
var s=JSON.parse(raw);
var root=document.documentElement;
if(s&&s.glassEnabled===true){
var o=typeof s.windowOpacity==="number"&&isFinite(s.windowOpacity)?Math.min(${MAX_SURFACE_OPACITY},Math.max(${MIN_SURFACE_OPACITY},s.windowOpacity)):${MAX_SURFACE_OPACITY};
root.classList.add(${JSON.stringify(GLASS_ROOT_CLASS)});
root.style.setProperty(${JSON.stringify(SURFACE_OPACITY_VAR)},String(o));
root.style.setProperty(${JSON.stringify(BACKDROP_BLUR_VAR)},${JSON.stringify(`${BACKDROP_BLUR_PX}px`)});
}else{
root.classList.remove(${JSON.stringify(GLASS_ROOT_CLASS)});
root.style.removeProperty(${JSON.stringify(SURFACE_OPACITY_VAR)});
root.style.removeProperty(${JSON.stringify(BACKDROP_BLUR_VAR)});
}
}catch(e){}})();`;
}

/**
 * bfcache resync: re-stamp on back/forward-cache restore so a page resurrected
 * from bfcache (which keeps the *old* DOM, possibly stamped under a stale
 * setting changed in another tab) matches the persisted glass setting again.
 * Pure builder returning the listener body; the caller wires it to `pageshow`.
 * Only restores from bfcache (`event.persisted`) need it — a normal load already
 * ran the head script.
 */
export function buildBfcacheResyncScript(): string {
	return `window.addEventListener("pageshow",function(e){if(e.persisted){${buildFirstPaintScript()}}});`;
}
