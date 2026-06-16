/**
 * Disable mastra's gateway type-generation sync in the packaged host-service
 * runtime.
 *
 * mastra's `GatewayRegistry` runs a periodic sync (gated on `MASTRA_DEV=true`)
 * that calls `fetchProviders()` on every registered gateway and writes the
 * generated TypeScript model-registry files into `@mastra/core`'s `dist/`
 * directory. In a source checkout that directory is writable, but in a packaged
 * desktop `.app` it lives inside the read-only `app.asar`, so each sync throws:
 *
 *   [GatewayRegistry] Gateway sync failed: ENOTDIR: not a directory, mkdir
 *   '/Applications/Rox.app/Contents/Resources/app.asar/node_modules/@mastra/core/dist'
 *
 * The host-service is a headless runtime — it never needs IDE autocomplete
 * types — so the registry sync has no value here and only produces a recurring
 * error loop. We force `MASTRA_DEV=false` before any mastra module loads.
 *
 * This module is imported FIRST in the host-service entry (`serve.ts`) so the
 * side effect runs before the harness import graph (`./app` → `mastracode` →
 * `@mastra/*`) initializes the gateway registry and reads `MASTRA_DEV`.
 *
 * Scope: the bundled/packaged runtime sets `NODE_ENV=production` (see
 * `build.ts`), while the dev host-service runs unbundled with
 * `NODE_ENV=development`. We only force the flag off when NOT in development, so
 * a developer can still opt into gateway type-gen in an unbundled dev run by
 * setting `MASTRA_DEV=true` themselves. The desktop coordinator additionally
 * pins `MASTRA_DEV=false` in the spawned child env; this guard is the in-process
 * backstop that also covers CLI-spawned packaged host-service instances.
 */

/**
 * Force-disable mastra gateway sync unless running an unbundled dev host-service.
 * Returns true when the flag was pinned off, false when left untouched (dev).
 * Pure with respect to its `env` argument so it can be unit-tested without
 * relying on module-load side effects.
 */
export function disableGatewaySyncForPackagedRuntime(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	if (env.NODE_ENV === "development") return false;
	env.MASTRA_DEV = "false";
	return true;
}

disableGatewaySyncForPackagedRuntime();
