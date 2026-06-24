import { AppLoadingScreen } from "@/app/components/AppLoadingScreen";

/**
 * App-shell loading UI for the authenticated `(agents)` surface
 * (custom-loading-screens epic). Next.js renders this Suspense boundary while a
 * route segment streams. The actual screen is a client component so it can read
 * appearance settings + the current wallpaper.
 *
 * This loader is scoped to the authenticated app shell ON PURPOSE: a global
 * `app/loading.tsx` boundary made every dynamic route (including the public
 * `@<handle>` / `/s` / `/u` pages) commit a streamed HTTP 200 before their
 * `notFound()` could run, turning real 404s into soft-404s. Keeping the loader
 * per-surface lets unknown public handles return a genuine 404.
 */
export default function Loading() {
	return <AppLoadingScreen />;
}
