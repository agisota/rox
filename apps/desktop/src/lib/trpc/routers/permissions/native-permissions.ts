import type {
	shell as electronShell,
	systemPreferences as electronSystemPreferences,
} from "electron";
import {
	type AutomationRequestResult,
	assertKnownAutomationTarget,
	requestAllAutomationTargets,
	requestAutomationForTarget,
} from "../../../../main/lib/automation-permission";
import { AUTOMATION_TARGETS } from "../../../../main/lib/automation-targets";
import { checkFullDiskAccess } from "./full-disk-access";

export const PERMISSION_SETTINGS_URLS = {
	fullDiskAccess:
		"x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
	accessibility:
		"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
	microphone:
		"x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
	screenRecording:
		"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
	appleEvents:
		"x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Automation",
	localNetwork:
		"x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_LocalNetwork",
} as const;

type ShellApi = Pick<typeof electronShell, "openExternal">;
type SystemPreferencesApi = Pick<
	typeof electronSystemPreferences,
	"askForMediaAccess" | "getMediaAccessStatus" | "isTrustedAccessibilityClient"
>;

function getElectronShell(): ShellApi {
	return (require("electron") as Partial<typeof import("electron")>)
		.shell as ShellApi;
}

function getElectronSystemPreferences(): SystemPreferencesApi | undefined {
	return (require("electron") as Partial<typeof import("electron")>)
		.systemPreferences;
}

export function checkAccessibility({
	systemPreferencesApi = getElectronSystemPreferences(),
}: {
	systemPreferencesApi?: Pick<
		SystemPreferencesApi,
		"isTrustedAccessibilityClient"
	>;
} = {}): boolean {
	return systemPreferencesApi?.isTrustedAccessibilityClient(false) ?? false;
}

export function checkMicrophone({
	systemPreferencesApi = getElectronSystemPreferences(),
}: {
	systemPreferencesApi?: Pick<SystemPreferencesApi, "getMediaAccessStatus">;
} = {}): boolean {
	try {
		return (
			systemPreferencesApi?.getMediaAccessStatus("microphone") === "granted"
		);
	} catch {
		return false;
	}
}

export function checkScreenRecording({
	systemPreferencesApi = getElectronSystemPreferences(),
}: {
	systemPreferencesApi?: Pick<SystemPreferencesApi, "getMediaAccessStatus">;
} = {}): boolean {
	try {
		return systemPreferencesApi?.getMediaAccessStatus("screen") === "granted";
	} catch {
		return false;
	}
}

export function getPermissionStatus() {
	return {
		fullDiskAccess: checkFullDiskAccess(),
		accessibility: checkAccessibility(),
		microphone: checkMicrophone(),
		screenRecording: checkScreenRecording(),
	};
}

/** The Automation targets registry, surfaced to the renderer for per-target UI. */
export function getAutomationTargets(): readonly {
	id: string;
	bundleId: string;
	label: string;
}[] {
	return AUTOMATION_TARGETS;
}

export async function requestFullDiskAccess({
	shellApi = getElectronShell(),
}: {
	shellApi?: ShellApi;
} = {}): Promise<void> {
	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.fullDiskAccess);
}

export async function requestAccessibility({
	shellApi = getElectronShell(),
}: {
	shellApi?: ShellApi;
} = {}): Promise<void> {
	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.accessibility);
}

export async function requestMicrophone({
	shellApi = getElectronShell(),
	systemPreferencesApi,
}: {
	shellApi?: ShellApi;
	systemPreferencesApi?: Pick<SystemPreferencesApi, "askForMediaAccess">;
} = {}): Promise<{ granted: boolean }> {
	try {
		if (process.platform === "darwin") {
			const preferencesApi =
				systemPreferencesApi ?? getElectronSystemPreferences();
			const granted = await preferencesApi?.askForMediaAccess("microphone");
			if (granted) {
				return { granted: true };
			}
		}
	} catch {
		// Fall through to opening System Settings.
	}

	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.microphone);
	return { granted: false };
}

/**
 * Screen Recording cannot be prompted programmatically the way media access can
 * (Electron's askForScreenCaptureAccess only nudges on first real capture), so
 * we deep-link to the Screen Recording pane.
 */
export async function requestScreenRecording({
	shellApi = getElectronShell(),
}: {
	shellApi?: ShellApi;
} = {}): Promise<void> {
	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.screenRecording);
}

/**
 * Request Automation access for ALL known targets (sequentially). This is what
 * makes Rox appear in the Automation pane for every target and shows the
 * per-app consent dialogs one at a time. Used by the first-launch gate's
 * "enable automation" action.
 */
export async function requestAppleEvents(): Promise<AutomationRequestResult[]> {
	return requestAllAutomationTargets();
}

/** Request Automation access for a single target (raises one consent dialog). */
export async function requestAutomation(
	bundleId: string,
): Promise<AutomationRequestResult> {
	assertKnownAutomationTarget(bundleId);
	return requestAutomationForTarget(bundleId);
}

/** Open the Automation settings pane (secondary affordance, sends no event). */
export async function openAutomationSettings({
	shellApi = getElectronShell(),
}: {
	shellApi?: ShellApi;
} = {}): Promise<void> {
	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.appleEvents);
}

export async function requestLocalNetwork({
	shellApi = getElectronShell(),
}: {
	shellApi?: ShellApi;
} = {}): Promise<void> {
	await shellApi.openExternal(PERMISSION_SETTINGS_URLS.localNetwork);
}
