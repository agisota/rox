import { boolean, defineConfig, string } from "@rox/cli-framework";

const VERSION = "0.2.19";

export default defineConfig({
	name: "rox",
	version: VERSION,
	commandsDir: "./src/commands",
	outfile: "./dist/rox",
	define: {
		"process.env.RELAY_URL": JSON.stringify(
			process.env.RELAY_URL ?? "https://relay.rox.one",
		),
		"process.env.ROX_API_URL": JSON.stringify(
			process.env.ROX_API_URL ?? "https://api.rox.one",
		),
		"process.env.ROX_WEB_URL": JSON.stringify(
			process.env.ROX_WEB_URL ?? "https://app.rox.one",
		),
		"process.env.ROX_VERSION": JSON.stringify(VERSION),
	},
	globals: {
		json: boolean().desc("Output as JSON (auto-on under CI/agent envs)"),
		quiet: boolean().desc("Output IDs only"),
		apiKey: string()
			.env("ROX_API_KEY")
			.desc("Use a Rox API key (sk_live_…) instead of OAuth login"),
	},
});
