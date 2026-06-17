import { WallpaperLayer } from "@rox/ui/wallpaper-layer";
import {
	useCurrentWallpaper,
	useInitWallpaperStore,
} from "renderer/stores/wallpaper";

/**
 * Global wallpaper background (custom-loading-screens epic).
 *
 * Mounted once behind the authenticated app content. It boots the wallpaper
 * store (hydration + rotation timer) and renders the pure {@link WallpaperLayer}
 * driven by the store's resolved wallpaper. The layer is fixed and full-bleed
 * with a negative z-index so glass-panel surfaces show it through; it renders
 * nothing when no wallpaper is selected.
 */
export function WallpaperBackground() {
	useInitWallpaperStore();
	const wallpaper = useCurrentWallpaper();
	return <WallpaperLayer wallpaper={wallpaper} />;
}
