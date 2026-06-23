import path from "node:path";
import { config } from "dotenv";
import type { ConfigContext } from "expo/config";

// Load .env file
config({
	path: path.resolve(__dirname, "../../.env"),
	override: true,
	quiet: true,
});

export default ({ config }: ConfigContext) => ({
	...config,
	name: "Rox",
	slug: "rox",
	version: "1.0.0",
	orientation: "portrait",
	icon: "./assets/icon.png",
	userInterfaceStyle: "dark",
	scheme: "rox",
	splash: {
		image: "./assets/splash-icon.png",
		resizeMode: "contain" as const,
		backgroundColor: "#09090b",
	},
	ios: {
		supportsTablet: true,
		bundleIdentifier: "sh.rox.mobile",
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
			NSMicrophoneUsageDescription:
				"Rox uses the microphone to dictate task titles and descriptions.",
		},
	},
	android: {
		adaptiveIcon: {
			foregroundImage: "./assets/adaptive-icon.png",
			backgroundColor: "#ffffff",
		},
		package: "sh.rox.mobile",
		predictiveBackGestureEnabled: false,
		permissions: ["android.permission.RECORD_AUDIO"],
	},
	web: {
		favicon: "./assets/favicon.png",
		bundler: "metro",
	},
	plugins: [
		"expo-router",
		"expo-localization",
		[
			"expo-audio",
			{
				microphonePermission:
					"Rox uses the microphone to dictate task titles and descriptions.",
			},
		],
	],
	extra: {
		router: {},
		eas: {
			projectId: "fa9332a8-896a-4d2a-be5b-d82469b46e5d",
		},
	},
	owner: "supserset-sh",
});
