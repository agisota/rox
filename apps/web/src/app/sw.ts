/**
 * Service worker (F50, Hermes-borrow #645) — built by `@serwist/next` from this
 * source via `InjectManifest`. Compiled to `/sw.js` and registered by the
 * `SerwistProvider` in `layout.tsx`.
 *
 * Caching policy (security-critical):
 *   - `/api/*` and the auth routes (`/login`, `/auth/*`, `/oauth/*`) are
 *     **NetworkOnly** — authenticated responses and the login flow must never be
 *     cached, so a revoked session or rotated token can never be served stale.
 *   - Navigations (the app shell HTML) are **NetworkFirst** with a short timeout,
 *     falling back to the cached shell and finally the `/~offline` page when
 *     truly offline.
 *   - Static assets (`script`/`style`/`font`/`image`) are **StaleWhileRevalidate**
 *     so the shell paints instantly offline while refreshing in the background.
 *
 * Version pinning: `precacheEntries` are content-hashed by the build (no
 * stale-forever precache), and `CACHE_VERSION` namespaces every runtime cache so
 * bumping it on a breaking change retires old caches instead of serving them
 * indefinitely. `skipWaiting` + `clientsClaim` activate the new SW promptly.
 */

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
	CacheableResponsePlugin,
	ExpirationPlugin,
	NetworkFirst,
	NetworkOnly,
	Serwist,
	StaleWhileRevalidate,
} from "serwist";

declare global {
	interface WorkerGlobalScope extends SerwistGlobalConfig {
		__SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
	}
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Bump on any breaking change to the runtime cache shape. It namespaces every
 * runtime cache below so old caches are abandoned (and swept by Serwist) rather
 * than served forever — the issue's "version-pinned, no stale-forever" rule.
 */
const CACHE_VERSION = "v1";
const cacheName = (name: string) => `rox-${name}-${CACHE_VERSION}`;

/** Never-cache the auth surface and API: a stale auth response is a security bug. */
function isNeverCache(url: URL): boolean {
	const path = url.pathname;
	return (
		path.startsWith("/api/") ||
		path === "/api" ||
		path === "/login" ||
		path.startsWith("/login/") ||
		path.startsWith("/auth/") ||
		path.startsWith("/oauth/")
	);
}

const serwist = new Serwist({
	precacheEntries: self.__SW_MANIFEST,
	skipWaiting: true,
	clientsClaim: true,
	navigationPreload: true,
	runtimeCaching: [
		// Auth + API: strictly network-only, no cache entry ever created.
		{
			matcher: ({ url, sameOrigin }) => sameOrigin && isNeverCache(url),
			handler: new NetworkOnly(),
		},
		// App shell navigations: network-first, fall back to cache then /~offline.
		{
			matcher: ({ request, url, sameOrigin }) =>
				sameOrigin && request.mode === "navigate" && !isNeverCache(url),
			handler: new NetworkFirst({
				cacheName: cacheName("pages"),
				networkTimeoutSeconds: 5,
				plugins: [
					new CacheableResponsePlugin({ statuses: [0, 200] }),
					new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 86_400 }),
				],
			}),
		},
		// Static assets: instant offline paint, refreshed in the background.
		{
			matcher: ({ request, sameOrigin }) =>
				sameOrigin &&
				["script", "style", "font", "image"].includes(request.destination),
			handler: new StaleWhileRevalidate({
				cacheName: cacheName("assets"),
				plugins: [
					new CacheableResponsePlugin({ statuses: [0, 200] }),
					new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 604_800 }),
				],
			}),
		},
	],
	fallbacks: {
		entries: [
			{
				url: "/~offline",
				matcher: ({ request }) => request.destination === "document",
			},
		],
	},
});

serwist.addEventListeners();
