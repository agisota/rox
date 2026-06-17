import { getWallpaper } from "@rox/shared/appearance";
import { WallpaperBackground } from "@/components/appearance/WallpaperBackground";
import { useAppearance } from "@/screens/RootLayout/providers/AppearanceProvider";

/**
 * Connected global wallpaper background.
 *
 * Reads the active wallpaper from {@link useAppearance} and renders it via
 * {@link WallpaperBackground}. Mount it as the first child of a full-screen
 * container so the selected wallpaper sits behind app content; renders `null`
 * when no wallpaper is selected.
 */
export function AppearanceBackground() {
	const { settings } = useAppearance();
	const wallpaper = getWallpaper(settings.wallpaperId) ?? null;
	return <WallpaperBackground wallpaper={wallpaper} />;
}
