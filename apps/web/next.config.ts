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

const isProduction = process.env.NODE_ENV === "production";
const apiOrigin = process.env.NEXT_PUBLIC_API_URL
	? new URL(process.env.NEXT_PUBLIC_API_URL).origin
	: null;
// The web app reaches host-services through the relay — a WebSocket for the
// terminal stream and HTTP for host tRPC. In dev the blanket `ws:`/`wss:`
// below covers the socket; prod needs the relay origins listed explicitly so
// `connect-src` blocks neither. The hard-coded prod fallback keeps the header
// correct even if RELAY_URL isn't plumbed into the build env.
const relayWsOrigin = process.env.RELAY_URL
	? new URL(process.env.RELAY_URL).origin.replace(/^http/, "ws")
	: isProduction
		? "wss://relay.rox.one"
		: null;
const relayHttpOrigin = process.env.RELAY_URL
	? new URL(process.env.RELAY_URL).origin
	: isProduction
		? "https://relay.rox.one"
		: null;

const contentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	[
		"connect-src 'self'",
		apiOrigin,
		relayWsOrigin,
		relayHttpOrigin,
		"wss://relay-backup.rox.one",
		"https://relay-backup.rox.one",
		"https://*.ingest.sentry.io",
		"https://*.sentry.io",
		"https://us.i.posthog.com",
		"https://us-assets.i.posthog.com",
		"https://us.posthog.com",
		!isProduction && "ws:",
		!isProduction && "wss:",
	]
		.filter(Boolean)
		.join(" "),
	"font-src 'self' data: https://fonts.gstatic.com",
	"form-action 'self'",
	"frame-ancestors 'none'",
	// The Telegram Login widget renders its button inside an iframe served from
	// oauth.telegram.org; without an explicit frame-src it falls back to
	// default-src 'self' and the button never appears.
	"frame-src 'self' https://oauth.telegram.org",
	"img-src 'self' data: blob: https:",
	"object-src 'none'",
	// telegram.org hosts telegram-widget.js, the script that injects the login
	// widget. It must be whitelisted or the browser blocks it under script-src.
	[
		"script-src 'self' 'unsafe-inline' https://telegram.org",
		!isProduction && "'unsafe-eval'",
	]
		.filter(Boolean)
		.join(" "),
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"worker-src 'self' blob:",
].join("; ");

const securityHeaders: Array<{ key: string; value: string }> = [
	...(isProduction
		? [
				{
					key: "Strict-Transport-Security",
					value: "max-age=31536000; includeSubDomains",
				},
			]
		: []),
	{
		key: "Content-Security-Policy",
		value: contentSecurityPolicy,
	},
	{
		key: "Permissions-Policy",
		value: "camera=(), geolocation=(), microphone=()",
	},
	{
		key: "Referrer-Policy",
		value: "strict-origin-when-cross-origin",
	},
	{
		key: "X-Content-Type-Options",
		value: "nosniff",
	},
	{
		key: "X-Frame-Options",
		value: "DENY",
	},
];

const config: NextConfig = {
	reactCompiler: true,

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
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

	async headers() {
		return [
			{
				source: "/(.*)",
				headers: securityHeaders,
			},
			{
				// Public share snapshots (`/s/*` chat/artifact/note, `/d/*` Drive)
				// must never be cached by browsers or shared/CDN caches: once a share
				// is revoked the page returns notFound(), but a cached copy would keep
				// leaking the content. `no-store` guarantees every view re-resolves the
				// share against the live DB (which filters out `revokedAt`).
				source: "/s/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "no-store, max-age=0, must-revalidate",
					},
				],
			},
			{
				source: "/d/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "no-store, max-age=0, must-revalidate",
					},
				],
			},
		];
	},

	skipTrailingSlashRedirect: true,
};

export default withSentryConfig(config, {
	org: "agisota",
	project: "web",
	silent: !process.env.CI,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	widenClientFileUpload: true,
	tunnelRoute: "/monitoring",
	disableLogger: true,
	automaticVercelMonitors: true,
});
