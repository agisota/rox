import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";

// Load .env from monorepo root during development
if (process.env.NODE_ENV !== "production") {
	dotenvConfig({
		path: join(process.cwd(), "../../.env"),
		override: true,
		quiet: true,
	});
}

const config: NextConfig = {
	reactStrictMode: true,
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },

	// Local preview only (not committed): allow the Cloudflare quick-tunnel host
	// to load Next dev resources so the page renders when shared externally.
	allowedDevOrigins: ["*.trycloudflare.com"],

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
			},
			{
				protocol: "https",
				hostname: "unavatar.io",
			},
		],
	},

	async rewrites() {
		return [
			{
				source: "/ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ingest/:path*",
				destination: "https://us.i.posthog.com/:path*",
			},
			{
				source: "/ingest/decide",
				destination: "https://us.i.posthog.com/decide",
			},
		];
	},

	async redirects() {
		const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.rox.one";
		const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://app.rox.one";
		return [
			{
				// Public profiles + share links live on the web app (app.rox.one),
				// which is the only app with DB access. Users share/visit the
				// `@<handle>` form on the marketing domain (`rox.one/@<handle>`).
				// Redirect the profile ROOT to the canonical renderer. `@` is
				// matched literally; `:handle` captures the nickname.
				// NOTE: must be a single, non-repeated param — Next 16's
				// path-to-regexp rejects `/@:handle*` ("Can not repeat 'handle'
				// without a prefix and suffix"), so the sub-path case is a
				// separate rule below.
				source: "/@:handle",
				destination: `${webUrl}/@:handle`,
				permanent: false,
			},
			{
				// Sub-paths (sections / skills / shared). The `/` before `:path*`
				// gives the repeated param its required delimiter.
				source: "/@:handle/:path*",
				destination: `${webUrl}/@:handle/:path*`,
				permanent: false,
			},
			{
				source: "/about",
				destination: "/team",
				permanent: true,
			},
			{
				source: "/changelog/2026-03-09-codemirror-workspace-modal-icons",
				destination: "/changelog/2026-03-09-codemirror-workspace",
				permanent: true,
			},
			{
				source: "/docs/:path*",
				destination: `${docsUrl}/:path*`,
				permanent: false,
			},
		];
	},

	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "X-Frame-Options", value: "DENY" },
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=()",
					},
				],
			},
		];
	},

	skipTrailingSlashRedirect: true,

	// Hide the Next.js dev overlay/indicator badge.
	devIndicators: false,
};

export default withSentryConfig(config, {
	org: "agisota",
	project: "marketing",
	silent: !process.env.CI,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	widenClientFileUpload: true,
	tunnelRoute: "/monitoring",
	disableLogger: true,
	automaticVercelMonitors: true,
});
