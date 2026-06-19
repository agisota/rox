import { describe, expect, it, mock } from "bun:test";

mock.module("electron", () => ({
	shell: {
		openExternal: mock(async () => {}),
	},
	systemPreferences: {
		askForMediaAccess: mock(async () => false),
		getMediaAccessStatus: mock(() => "not-determined"),
		isTrustedAccessibilityClient: mock(() => false),
	},
	// bun runs all tests in one process and mock.module("electron") leaks across
	// files; include app/dialog so a later file linking against this mock (e.g.
	// auto-updater.ts imports { app, dialog }) doesn't throw "Export named ... not found".
	app: {
		getPath: mock(() => ""),
		getName: mock(() => "test-app"),
		getVersion: mock(() => "1.0.0"),
		getAppPath: mock(() => ""),
		isPackaged: false,
	},
	dialog: {
		showMessageBox: mock(() => Promise.resolve({ response: 0 })),
	},
}));

// Stub the automation service so tests never spawn a real `osascript` (which on
// macOS would fire real Apple Events / consent dialogs).
const requestAllMock = mock(async () => [
	{ bundleId: "com.apple.finder", granted: true },
]);
const requestOneMock = mock(async (bundleId: string) => ({
	bundleId,
	granted: true,
}));
const assertKnownMock = mock((_bundleId: string) => {});

mock.module("../../../../main/lib/automation-permission", () => ({
	requestAllAutomationTargets: requestAllMock,
	requestAutomationForTarget: requestOneMock,
	assertKnownAutomationTarget: assertKnownMock,
}));

const {
	checkAccessibility,
	checkMicrophone,
	checkScreenRecording,
	getAutomationTargets,
	openAutomationSettings,
	PERMISSION_SETTINGS_URLS,
	requestAccessibility,
	requestAppleEvents,
	requestAutomation,
	requestFullDiskAccess,
	requestLocalNetwork,
	requestMicrophone,
} = await import("./native-permissions");

function createShellRecorder() {
	const openedUrls: string[] = [];

	return {
		openedUrls,
		shellApi: {
			openExternal: async (url: string) => {
				openedUrls.push(url);
			},
		},
	};
}

describe("native permissions", () => {
	it("checks Accessibility with the native trusted-client API", () => {
		expect(
			checkAccessibility({
				systemPreferencesApi: {
					isTrustedAccessibilityClient: (prompt) => prompt === false,
				},
			}),
		).toBe(true);
	});

	it("checks Microphone granted status", () => {
		expect(
			checkMicrophone({
				systemPreferencesApi: {
					getMediaAccessStatus: () => "granted",
				},
			}),
		).toBe(true);

		expect(
			checkMicrophone({
				systemPreferencesApi: {
					getMediaAccessStatus: () => "denied",
				},
			}),
		).toBe(false);
	});

	it("checks Screen Recording granted status", () => {
		expect(
			checkScreenRecording({
				systemPreferencesApi: { getMediaAccessStatus: () => "granted" },
			}),
		).toBe(true);
		expect(
			checkScreenRecording({
				systemPreferencesApi: { getMediaAccessStatus: () => "denied" },
			}),
		).toBe(false);
	});

	it("treats Microphone status errors as not granted", () => {
		expect(
			checkMicrophone({
				systemPreferencesApi: {
					getMediaAccessStatus: () => {
						throw new Error("unavailable");
					},
				},
			}),
		).toBe(false);
	});

	it("opens Full Disk Access settings", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		await requestFullDiskAccess({ shellApi });

		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.fullDiskAccess]);
	});

	it("opens Accessibility settings", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		await requestAccessibility({ shellApi });

		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.accessibility]);
	});

	it("returns granted when the native Microphone prompt grants access", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		const result = await requestMicrophone({
			shellApi,
			systemPreferencesApi: {
				askForMediaAccess: async () => true,
			},
		});

		if (process.platform === "darwin") {
			expect(result).toEqual({ granted: true });
			expect(openedUrls).toEqual([]);
		} else {
			expect(result).toEqual({ granted: false });
			expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.microphone]);
		}
	});

	it("opens Microphone settings when the native prompt does not grant access", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		const result = await requestMicrophone({
			shellApi,
			systemPreferencesApi: {
				askForMediaAccess: async () => false,
			},
		});

		expect(result).toEqual({ granted: false });
		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.microphone]);
	});

	it("opens Microphone settings when the native prompt fails", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		const result = await requestMicrophone({
			shellApi,
			systemPreferencesApi: {
				askForMediaAccess: async () => {
					throw new Error("unavailable");
				},
			},
		});

		expect(result).toEqual({ granted: false });
		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.microphone]);
	});

	it("opens the Automation settings pane via openAutomationSettings", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		await openAutomationSettings({ shellApi });

		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.appleEvents]);
	});

	it("requestAppleEvents requests automation for all targets (no settings URL)", async () => {
		requestAllMock.mockClear();
		const result = await requestAppleEvents();
		expect(requestAllMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual([{ bundleId: "com.apple.finder", granted: true }]);
	});

	it("requestAutomation validates the target then requests it", async () => {
		assertKnownMock.mockClear();
		requestOneMock.mockClear();
		const result = await requestAutomation("com.apple.finder");
		expect(assertKnownMock).toHaveBeenCalledWith("com.apple.finder");
		expect(requestOneMock).toHaveBeenCalledWith("com.apple.finder");
		expect(result).toEqual({ bundleId: "com.apple.finder", granted: true });
	});

	it("exposes the automation targets registry (no bash, real Shortcuts host)", () => {
		const targets = getAutomationTargets();
		const bundleIds = targets.map((t) => t.bundleId);
		expect(bundleIds).toContain("com.apple.systemevents");
		expect(bundleIds).toContain("com.apple.shortcuts.events");
		expect(bundleIds.some((id) => id.includes("bash"))).toBe(false);
	});

	it("opens Local Network settings", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		await requestLocalNetwork({ shellApi });

		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.localNetwork]);
	});
});
