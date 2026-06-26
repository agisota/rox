/**
 * Bundles the host-service entry point into a single JS file that can be
 * executed by a standalone Node.js runtime. Native addons (better-sqlite3,
 * node-pty) are marked external and must be resolved at runtime from
 * lib/native/ in the distribution bundle.
 */
import { existsSync, mkdirSync } from "node:fs";

const outdir = "dist";
if (!existsSync(outdir)) {
	mkdirSync(outdir, { recursive: true });
}

const result = await Bun.build({
	entrypoints: ["src/serve.ts"],
	target: "node",
	outdir,
	naming: "host-service.js",
	format: "esm",
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	external: [
		"better-sqlite3",
		"node-pty",
		// playwright-core's bidiOverCdp module does a deep CJS require of
		// `chromium-bidi/lib/cjs/...`, but chromium-bidi is not a direct
		// dependency of playwright-core — it only lands in node_modules when a
		// puppeteer-core install hoists it. Newer @browserbasehq/stagehand
		// (pulled in transitively via mastracode) moved puppeteer-core from
		// optionalDependencies to optional peerDependencies, so chromium-bidi
		// is no longer installed and Bun can't statically resolve the require.
		// The require is lazy (only hit when driving a browser over BiDi-over-CDP
		// transport, which the host-service never does), so marking it external
		// keeps it as an inert runtime require instead of failing the bundle.
		"chromium-bidi",
		"@parcel/watcher",
		"libsql",
		"onnxruntime-node",
		"@anush008/tokenizers",
		"@anush008/tokenizers-darwin-universal",
		"@anush008/tokenizers-linux-x64-gnu",
		"@anush008/tokenizers-linux-arm64-gnu",
		"@anush008/tokenizers-win32-x64-msvc",
		"@mastra/duckdb",
		"@duckdb/node-api",
		"@duckdb/node-bindings",
		"@duckdb/node-bindings-darwin-arm64",
		"@duckdb/node-bindings-darwin-x64",
		"@duckdb/node-bindings-linux-x64",
		"@duckdb/node-bindings-linux-arm64",
		"@duckdb/node-bindings-win32-x64",
		"@duckdb/node-bindings-win32-arm64",
	],
});

if (!result.success) {
	console.error("[host-service] build failed:");
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}

console.log(`[host-service] bundled to ${outdir}/host-service.js`);
