import { SKIN_STORAGE_KEY } from "@rox/shared/constants";

/**
 * Pre-hydration skin script (F06 integration for F08).
 *
 * `next-themes` already sets the `.dark` class before paint to kill the
 * theme-axis flash; this does the same for the *skin* axis by reading the
 * persisted skin id from localStorage and stamping `data-skin` onto
 * `<html>` synchronously, before React hydrates. The SkinProvider then applies
 * the matching CSS-var overrides with `prevSkin = null` (a flash-free hard set),
 * so the attribute and the applied palette agree from the very first frame.
 *
 * Only the attribute is set here (cheap, no palette math in the blocking
 * script); the heavier CSS-var application happens once the provider mounts.
 */
export function SkinScript() {
	const js = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
		SKIN_STORAGE_KEY,
	)});if(s){document.documentElement.setAttribute('data-skin',s);}}catch(e){}})();`;
	// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted constant script (no user input) that must block before hydration to avoid a skin flash
	return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
