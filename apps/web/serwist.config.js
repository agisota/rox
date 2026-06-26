import { serwist } from "@serwist/next/config";

/**
 * Serwist configurator (F50, Hermes-borrow #645).
 *
 * Consumed by `@serwist/cli` (`serwist build -c serwist.config.js`, wired into
 * the `build:sw` script after `next build`). Configurator mode is the
 * Turbopack-safe path: `@serwist/next`'s webpack plugin can't run under
 * Turbopack, so the CLI compiles `src/app/sw.ts` → `public/sw.js` (esbuild) and
 * injects the precache manifest from the freshly built `.next` output.
 *
 * Plain JS (not TS) because `@serwist/cli` imports this module directly without
 * a TS loader; the service worker source itself stays `src/app/sw.ts` and is
 * transpiled by Serwist's esbuild step. `withNextConfig` reads the resolved
 * Next.js config so the default glob patterns (`.next/static/**` + `public/**`)
 * and the HTML→route URL transforms line up with this app's `distDir`/`basePath`.
 *
 * @type {Promise<import("@serwist/cli").BuildOptions>}
 */
export default serwist.withNextConfig(() => ({
	swSrc: "src/app/sw.ts",
	swDest: "public/sw.js",
}));
