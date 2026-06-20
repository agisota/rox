const { describe, expect, test } = require("bun:test");

const {
	parsePackagedAppHelperPids,
} = require("./canvas-smoke-process-cleanup.cjs");

describe("parsePackagedAppHelperPids", () => {
	test("selects orphan helpers from the packaged smoke app and ignores unrelated Rox apps", () => {
		const packagedAppRoot = "/repo/apps/desktop/release/mac-arm64/Rox.app";
		const processList = [
			"88104     1 Ss  /repo/apps/desktop/release/mac-arm64/Rox.app/Contents/MacOS/Rox /repo/apps/desktop/release/mac-arm64/Rox.app/Contents/Resources/app.asar/dist/main/terminal-host.js",
			"65637     1 S   /Applications/Rox.app/Contents/Frameworks/Electron Framework.framework/Helpers/chrome_crashpad_handler --database=/Users/me/Library/Application Support/Rox/Crashpad",
			"95041 50803 Ss  /bin/zsh -lc ps -eo pid,ppid,command | rg '/repo/apps/desktop/release/mac-arm64/Rox.app'",
			"12345 12000 S   /repo/apps/desktop/release/mac-arm64/Rox.app/Contents/MacOS/Rox --current-smoke-process",
		].join("\n");

		expect(
			parsePackagedAppHelperPids({
				processList,
				packagedAppRoot,
				currentPid: 12345,
			}),
		).toEqual([88104]);
	});
});
