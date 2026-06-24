import { AppLoadingScreen } from "@/app/components/AppLoadingScreen";

/**
 * App-shell loading UI for the authenticated `drive` surface
 * (custom-loading-screens epic). Scoped per-surface so the public `@<handle>` /
 * `/s` / `/u` routes are NOT wrapped by a streaming Suspense boundary that would
 * otherwise commit HTTP 200 before their `notFound()` runs (soft-404).
 */
export default function Loading() {
	return <AppLoadingScreen />;
}
