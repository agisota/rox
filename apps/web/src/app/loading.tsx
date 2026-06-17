import { AppLoadingScreen } from "./components/AppLoadingScreen";

/**
 * App-level loading UI (custom-loading-screens epic). Next.js renders this
 * Suspense boundary while a route segment streams. The actual screen is a
 * client component so it can read appearance settings + the current wallpaper.
 */
export default function Loading() {
	return <AppLoadingScreen />;
}
