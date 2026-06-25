/**
 * Electron Builder Configuration
 * @see https://www.electron.build/configuration/configuration
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Configuration } from "electron-builder";
import pkg from "./package.json";
import {
	packagedAsarUnpackGlobs,
	packagedNodeModuleCopies,
} from "./runtime-dependencies";

const currentYear = new Date().getFullYear();
const author = pkg.author?.name ?? pkg.author;
const productName = pkg.productName;
const macIconPath = join(pkg.resources, "build/icons/icon.icns");
const linuxIconPath = join(pkg.resources, "build/icons");
const winIconPath = join(pkg.resources, "build/icons/icon.ico");
const dmgBackgroundPath = join(
	pkg.resources,
	"build/installer/background.tiff",
);

// Bundled portable git (Ф2, #507). Staged by scripts/prepare-portable-git.ts
// into resources/git/<platform>-<arch>/ at package time, then copied outside
// the asar so it's spawnable via process.resourcesPath. Included only when the
// staged tree exists, so a dev/package build without it still packages cleanly;
// the runtime resolver (git-client.ts) prefers the user's system git and only
// falls back to this when no system git is found.
const BUNDLED_GIT_FROM = "resources/git";
const bundledGitExtraResources = existsSync(BUNDLED_GIT_FROM)
	? [{ from: BUNDLED_GIT_FROM, to: "resources/git", filter: ["**/*"] }]
	: [];

const config: Configuration = {
	appId: "com.rox.one",
	productName,
	copyright: `Copyright © ${currentYear} — ${author}`,
	electronVersion: pkg.devDependencies.electron.replace(/^\^/, ""),

	// Generate update manifests for all channels (latest.yml, canary.yml, etc.)
	// This enables proper channel-based auto-updates following electron-builder conventions
	generateUpdatesFilesForAllChannels: true,

	// Generate latest-mac.yml for auto-update (workflow handles actual upload)
	publish: {
		provider: "github",
		owner: "agisota",
		repo: "rox",
	},

	// Directories
	directories: {
		output: "release",
		buildResources: join(pkg.resources, "build"),
	},

	// ASAR configuration for native modules and external resources
	asar: true,
	asarUnpack: [
		...packagedAsarUnpackGlobs,
		// Sound files must be unpacked so external audio players (afplay, paplay, etc.) can access them
		"**/resources/sounds/**/*",
		// Tray icon must be unpacked so Electron Tray can load it
		"**/resources/tray/**/*",
	],

	// Extra resources placed outside asar archive (accessible via process.resourcesPath)
	extraResources: [
		// Database migrations - must be outside asar for drizzle-orm to read
		{
			from: "dist/resources/migrations",
			to: "resources/migrations",
			filter: ["**/*"],
		},
		{
			from: "dist/resources/host-migrations",
			to: "resources/host-migrations",
			filter: ["**/*"],
		},
		{
			from: "dist/resources/bin",
			to: "resources/bin",
			filter: ["**/*"],
		},
		{
			// Preinstall catalog (skills + subagents) unpacked into ~/.claude on
			// first run. Produced at build time by build-preinstall-catalog.ts
			// (curated set cloned from source repos) during prebuild/prepackage.
			from: "resources/preinstall",
			to: "resources/preinstall",
			filter: ["manifest.json", "*.tar.gz"],
		},
		// Portable git per platform/arch (present only when staged — see above).
		...bundledGitExtraResources,
	],

	files: [
		"dist/**/*",
		"package.json",
		{
			from: pkg.resources,
			to: "resources",
			filter: ["**/*"],
		},
		// Runtime modules that stay external to the main bundle.
		// bun creates symlinks for direct deps in workspace node_modules.
		// The copy:native-modules script replaces symlinks with real files
		// before building (required for Bun 1.3+ isolated installs).
		...packagedNodeModuleCopies,
		"!**/.DS_Store",
	],

	// Rebuild native modules for Electron's Node.js version
	npmRebuild: true,

	// macOS DMG installer
	dmg: {
		...(existsSync(dmgBackgroundPath) ? { background: dmgBackgroundPath } : {}),
		// Explicit size — dmgbuild's auto-calc under-allocates and silently truncates
		// the last large file above ~1.7GB of contents. `shrink: true` (default) keeps
		// the final artifact compact.
		size: "4g",
	},

	// macOS
	mac: {
		...(existsSync(macIconPath) ? { icon: macIconPath } : {}),
		category: "public.app-category.utilities",
		target: "default",
		// Hardened runtime is required for notarization but, combined with an ad-hoc
		// signature, macOS AMFI kills the app on launch (library validation rejects
		// the unsigned native modules). Enable it only when signing with a real cert.
		hardenedRuntime: Boolean(process.env.CSC_LINK),
		gatekeeperAssess: false,
		// Use the configured Apple certificate when present; otherwise apply an
		// ad-hoc signature so arm64 macOS builds are still structurally signed.
		identity: process.env.CSC_LINK ? undefined : "-",
		notarize: Boolean(process.env.APPLE_TEAM_ID),
		entitlements: join(pkg.resources, "build/entitlements.mac.plist"),
		entitlementsInherit: join(
			pkg.resources,
			"build/entitlements.mac.inherit.plist",
		),
		extendInfo: {
			CFBundleName: productName,
			CFBundleDisplayName: productName,
			// Required for macOS microphone permission prompt
			NSMicrophoneUsageDescription:
				"Rox needs microphone access so voice-enabled tools like Codex transcription can capture audio input.",
			// Required for macOS local network permission prompt
			NSLocalNetworkUsageDescription:
				"Rox needs access to your local network to discover and connect to development servers running on your network.",
			// Bonjour service types to browse for (triggers the permission prompt)
			NSBonjourServices: ["_http._tcp", "_https._tcp"],
			// Required for Apple Events / Automation permission prompt
			NSAppleEventsUsageDescription:
				"Rox needs to interact with other applications to run terminal commands and development tools.",
			// Surfaces the Full Disk Access redirect prompt copy
			NSSystemAdministrationUsageDescription:
				"Rox needs administrative file access to read and manage your projects across the filesystem.",
		},
	},

	// Deep linking protocol
	protocols: {
		name: productName,
		schemes: ["rox"],
	},

	// Linux
	linux: {
		...(existsSync(linuxIconPath) ? { icon: linuxIconPath } : {}),
		category: "Utility",
		synopsis: pkg.description,
		target: ["AppImage"],
		artifactName: `rox-\${version}-\${arch}.\${ext}`,
	},

	// Windows
	win: {
		...(existsSync(winIconPath) ? { icon: winIconPath } : {}),
		target: [
			{
				target: "nsis",
				arch: ["x64"],
			},
		],
		artifactName: `${productName}-${pkg.version}-\${arch}.\${ext}`,
	},

	// NSIS installer (Windows)
	nsis: {
		oneClick: false,
		allowToChangeInstallationDirectory: true,
	},
};

export default config;
