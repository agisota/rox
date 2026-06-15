import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { app, dialog, shell } from "electron";
import log from "electron-log/main";
import { autoUpdater } from "electron-updater";
import { env } from "main/env.main";
import { setSkipQuitConfirmation } from "main/index";
import { gte, prerelease } from "semver";
import {
	AUTO_UPDATE_STATUS,
	type AutoUpdateStatus,
	RELEASES_URL,
} from "shared/auto-update";
import { PLATFORM } from "shared/constants";

// electron-updater's internal cache only self-invalidates when the remote
// sha512 differs from cached metadata, so a corrupt cached download (e.g.
// failed Squirrel install) gets retried indefinitely until the user
// manually reinstalls. Reach into the protected helper to clear it.
interface AppUpdaterInternals {
	downloadedUpdateHelper: { clear(): Promise<void> } | null;
}

async function clearCachedUpdate(reason: string): Promise<void> {
	const helper = (autoUpdater as unknown as AppUpdaterInternals)
		.downloadedUpdateHelper;
	if (!helper) return;
	try {
		await helper.clear();
		log.info(`[auto-updater] Cleared cached update (${reason})`);
	} catch (error) {
		log.error("[auto-updater] Failed to clear cached update:", error);
	}
}

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 4; // 4 hours

/**
 * Detect if this is a prerelease build from app version using semver.
 * Versions like "0.0.53-canary" have prerelease component ["canary"].
 * Stable versions like "0.0.53" have no prerelease component.
 */
function isPrereleaseBuild(): boolean {
	const version = app.getVersion();
	const prereleaseComponents = prerelease(version);
	return prereleaseComponents !== null && prereleaseComponents.length > 0;
}

const IS_PRERELEASE = isPrereleaseBuild();
const IS_AUTO_UPDATE_PLATFORM = PLATFORM.IS_MAC || PLATFORM.IS_LINUX;

// Use explicit feed URLs to ensure we always fetch platform-specific manifests
// (for example latest-mac.yml and latest-linux.yml) from the correct release.
// - Stable: fetches from /releases/latest/download/ (latest non-prerelease)
// - Canary: fetches from /releases/download/desktop-canary/ (rolling canary tag)
const UPDATE_FEED_URL = IS_PRERELEASE
	? "https://github.com/agisota/rox/releases/download/desktop-canary"
	: "https://github.com/agisota/rox/releases/latest/download";

export interface AutoUpdateStatusEvent {
	status: AutoUpdateStatus;
	version?: string;
	error?: string;
	/**
	 * Direct, arch-correct .dmg download URL. Present on the notify-only
	 * `UPDATE_AVAILABLE` status for unsigned macOS builds so the renderer can
	 * open it in the browser (Squirrel.Mac can't auto-install unsigned apps).
	 */
	downloadUrl?: string;
	/** GitHub releases page for the new version, for "release notes". */
	notesUrl?: string;
}

// Arch-correct stable .dmg download URLs (electron-builder publishes stable
// names alongside the versioned assets). Squirrel can't install these on an
// unsigned build, so we hand the right one to the OS browser instead.
function getArchDownloadUrl(): string {
	const asset = process.arch === "arm64" ? "Rox-arm64.dmg" : "Rox-x64.dmg";
	return `https://github.com/agisota/rox/releases/latest/download/${asset}`;
}

// Notify-only mode: a macOS build with no Apple Developer ID can't be
// auto-installed by Squirrel.Mac, but we can still detect a newer version and
// prompt the user to download the .dmg manually. Probe the signing identity of
// the running .app once via `codesign`; a Developer ID Application authority
// means the (future) signed path stays on the real auto-update flow.
let notifyOnlyMode: boolean | null = null;

function detectNotifyOnlyMode(): Promise<boolean> {
	if (notifyOnlyMode !== null) return Promise.resolve(notifyOnlyMode);
	// Only packaged macOS builds are candidates; dev and other platforms keep
	// the standard Squirrel/AppImage flow.
	if (!PLATFORM.IS_MAC || !app.isPackaged) {
		notifyOnlyMode = false;
		return Promise.resolve(false);
	}
	return new Promise((resolve) => {
		// `codesign -dv` writes the signing authority chain to stderr. A signed
		// build lists "Authority=Developer ID Application: ..."; an ad-hoc or
		// unsigned build either fails or only reports a generic/ad-hoc signature.
		execFile(
			"codesign",
			["-dv", "--verbose=4", app.getPath("exe")],
			(error, _stdout, stderr) => {
				const output = `${stderr}`;
				const isSigned =
					!error && /Authority=Developer ID Application:/i.test(output);
				notifyOnlyMode = !isSigned;
				log.info(
					`[auto-updater] Signing probe: ${
						isSigned
							? "Developer ID signed (auto-install)"
							: "unsigned (notify-only)"
					}`,
				);
				resolve(notifyOnlyMode);
			},
		);
	});
}

// Cached details for the notify-only prompt so the install/openExternal path
// and re-emits can reuse the arch-correct URL without re-deriving it.
let notifyOnlyDownloadUrl: string | undefined;

export const autoUpdateEmitter = new EventEmitter();

// Network errors that don't need to be shown to the user
// These are transient/expected and will resolve on retry
const SILENT_ERROR_PATTERNS = [
	"net::ERR_INTERNET_DISCONNECTED",
	"net::ERR_NETWORK_CHANGED",
	"net::ERR_CONNECTION_REFUSED",
	"net::ERR_NAME_NOT_RESOLVED",
	"net::ERR_CONNECTION_TIMED_OUT",
	"net::ERR_CONNECTION_RESET",
	"ENOTFOUND",
	"ETIMEDOUT",
	"ECONNREFUSED",
	"ECONNRESET",
];

function isNetworkError(error: Error | string): boolean {
	const message = typeof error === "string" ? error : error.message;
	return SILENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

// Squirrel.Mac refuses to update ad-hoc/unsigned builds. Rather than going
// quiet, unsigned macOS builds switch to notify-only mode (see
// `detectNotifyOnlyMode`) and prompt the user to download the .dmg manually.
function isCodeSignatureError(error: Error | string): boolean {
	const message = typeof error === "string" ? error : error.message;
	return /code signature|codesign|signature validation|not signed/i.test(
		message,
	);
}

let currentStatus: AutoUpdateStatus = AUTO_UPDATE_STATUS.IDLE;
let currentVersion: string | undefined;
let currentDownloadUrl: string | undefined;
let currentNotesUrl: string | undefined;
let isDismissed = false;
let isInstalling = false;

// Statuses that are dismissible (parked until the next check) when the user
// clicks "later". READY is the Squirrel path; UPDATE_AVAILABLE is notify-only.
function isDismissibleStatus(status: AutoUpdateStatus): boolean {
	return (
		status === AUTO_UPDATE_STATUS.READY ||
		status === AUTO_UPDATE_STATUS.UPDATE_AVAILABLE
	);
}

function emitStatus(
	status: AutoUpdateStatus,
	version?: string,
	error?: string,
	extra?: { downloadUrl?: string; notesUrl?: string },
): void {
	currentStatus = status;
	currentVersion = version;
	currentDownloadUrl = extra?.downloadUrl;
	currentNotesUrl = extra?.notesUrl;

	if (isDismissed && isDismissibleStatus(status)) {
		return;
	}

	autoUpdateEmitter.emit("status-changed", {
		status,
		version,
		error,
		downloadUrl: extra?.downloadUrl,
		notesUrl: extra?.notesUrl,
	});
}

export function getUpdateStatus(): AutoUpdateStatusEvent {
	if (isDismissed && isDismissibleStatus(currentStatus)) {
		return { status: AUTO_UPDATE_STATUS.IDLE };
	}
	return {
		status: currentStatus,
		version: currentVersion,
		downloadUrl: currentDownloadUrl,
		notesUrl: currentNotesUrl,
	};
}

export function isUpdateReadyToInstall(): boolean {
	return isInstalling || currentStatus === AUTO_UPDATE_STATUS.READY;
}

export function installUpdate(): void {
	if (env.NODE_ENV === "development") {
		log.info("[auto-updater] Install skipped in dev mode");
		emitStatus(AUTO_UPDATE_STATUS.IDLE);
		return;
	}
	// Notify-only (unsigned macOS): there's no staged Squirrel download to swap
	// in — open the arch-correct .dmg (or the releases page) in the browser so
	// the user can download and reinstall manually.
	if (currentStatus === AUTO_UPDATE_STATUS.UPDATE_AVAILABLE) {
		const url = currentDownloadUrl ?? notifyOnlyDownloadUrl ?? RELEASES_URL;
		log.info(`[auto-updater] Notify-only install: opening ${url}`);
		void shell.openExternal(url);
		dismissUpdate();
		return;
	}
	// MacUpdater.quitAndInstall() registers a fresh native-updater
	// `update-downloaded` listener each time it runs before Squirrel.Mac has
	// finished staging. Without this guard, repeat clicks fan out into
	// parallel quitAndInstall calls once Squirrel fires — racing to swap
	// the binary and leaving the app on the old version.
	if (isInstalling) {
		log.info(
			"[auto-updater] Install already in progress, ignoring duplicate request",
		);
		return;
	}
	if (currentStatus !== AUTO_UPDATE_STATUS.READY) {
		log.warn(
			`[auto-updater] Install ignored: update not ready (status=${currentStatus})`,
		);
		return;
	}
	isInstalling = true;
	setSkipQuitConfirmation();
	autoUpdater.quitAndInstall(false, true);
}

export function dismissUpdate(): void {
	isDismissed = true;
	autoUpdateEmitter.emit("status-changed", { status: AUTO_UPDATE_STATUS.IDLE });
}

/**
 * Notify-only check for unsigned macOS builds. Reads the remote manifest
 * (latest-mac.yml) without downloading, compares versions, and emits an
 * UPDATE_AVAILABLE status carrying the arch-correct .dmg download URL. When
 * `interactive` is set, also surfaces an "up to date" dialog so the manual
 * "Check for updates" menu has feedback. Returns true when a newer version was
 * found, so the interactive path can suppress its own "up to date" dialog.
 */
async function runNotifyOnlyCheck(interactive: boolean): Promise<boolean> {
	// Reading the manifest is enough; never let electron-updater stage a
	// download it can't install on an unsigned build.
	autoUpdater.autoDownload = false;
	const result = await autoUpdater.checkForUpdates();
	const latestVersion = result?.updateInfo?.version;

	if (!latestVersion || gte(app.getVersion(), latestVersion)) {
		emitStatus(AUTO_UPDATE_STATUS.IDLE);
		return false;
	}

	const downloadUrl = getArchDownloadUrl();
	notifyOnlyDownloadUrl = downloadUrl;
	log.info(
		`[auto-updater] Notify-only update available: ${app.getVersion()} → ${latestVersion} (${downloadUrl})`,
	);
	emitStatus(AUTO_UPDATE_STATUS.UPDATE_AVAILABLE, latestVersion, undefined, {
		downloadUrl,
		notesUrl: RELEASES_URL,
	});
	if (interactive) {
		// The toast already prompts; keep the menu interaction quiet on success.
		log.info("[auto-updater] Interactive notify-only check found an update");
	}
	return true;
}

export function checkForUpdates(): void {
	if (env.NODE_ENV === "development" || !IS_AUTO_UPDATE_PLATFORM) {
		return;
	}
	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.CHECKING);

	void detectNotifyOnlyMode().then((notifyOnly) => {
		const run = notifyOnly
			? runNotifyOnlyCheck(false)
			: autoUpdater.checkForUpdates().then(() => undefined);

		run.catch((error: Error) => {
			if (isNetworkError(error)) {
				log.info("[auto-updater] Network unavailable, will retry later");
				emitStatus(AUTO_UPDATE_STATUS.IDLE);
				return;
			}
			log.error("[auto-updater] Failed to check for updates:", error);
			emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
		});
	});
}

export function checkForUpdatesInteractive(): void {
	if (env.NODE_ENV === "development") {
		dialog.showMessageBox({
			type: "info",
			title: "Updates",
			message: "Auto-updates are disabled in development mode.",
		});
		return;
	}
	if (!IS_AUTO_UPDATE_PLATFORM) {
		dialog.showMessageBox({
			type: "info",
			title: "Updates",
			message: "Auto-updates are only available on macOS and Linux.",
		});
		return;
	}

	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.CHECKING);

	void detectNotifyOnlyMode().then((notifyOnly) => {
		const run = notifyOnly
			? runNotifyOnlyCheck(true).then((updateFound) => {
					if (!updateFound) {
						dialog.showMessageBox({
							type: "info",
							title: "Обновлений нет",
							message: "У вас актуальная версия.",
							detail: `Версия ${app.getVersion()} — последняя доступная.`,
						});
					}
				})
			: autoUpdater.checkForUpdates().then((result) => {
					if (
						!result?.updateInfo ||
						gte(app.getVersion(), result.updateInfo.version)
					) {
						emitStatus(AUTO_UPDATE_STATUS.IDLE);
						dialog.showMessageBox({
							type: "info",
							title: "Обновлений нет",
							message: "У вас актуальная версия.",
							detail: `Версия ${app.getVersion()} — последняя доступная.`,
						});
					}
				});

		run.catch((error: Error) => {
			if (isNetworkError(error)) {
				log.info("[auto-updater] Network unavailable");
				emitStatus(AUTO_UPDATE_STATUS.IDLE);
				dialog.showMessageBox({
					type: "info",
					title: "Нет подключения к интернету",
					message:
						"Не удалось проверить обновления. Проверьте подключение к интернету.",
				});
				return;
			}
			if (isCodeSignatureError(error)) {
				// Fallback: if the signature probe missed an unsigned build and
				// electron-updater surfaces the signature error, treat it as
				// notify-only from here on and prompt a manual download.
				notifyOnlyMode = true;
				const downloadUrl = getArchDownloadUrl();
				notifyOnlyDownloadUrl = downloadUrl;
				emitStatus(AUTO_UPDATE_STATUS.UPDATE_AVAILABLE, undefined, undefined, {
					downloadUrl,
					notesUrl: RELEASES_URL,
				});
				return;
			}
			log.error("[auto-updater] Failed to check for updates:", error);
			emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
			dialog.showMessageBox({
				type: "error",
				title: "Ошибка обновления",
				message: "Не удалось проверить обновления. Попробуйте позже.",
			});
		});
	});
}

export function simulateUpdateReady(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.READY, "99.0.0-test");
}

export function simulateDownloading(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.DOWNLOADING, "99.0.0-test");
}

export function simulateUpdateAvailable(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	const downloadUrl = getArchDownloadUrl();
	notifyOnlyMode = true;
	notifyOnlyDownloadUrl = downloadUrl;
	emitStatus(AUTO_UPDATE_STATUS.UPDATE_AVAILABLE, "99.0.0-test", undefined, {
		downloadUrl,
		notesUrl: RELEASES_URL,
	});
}

export function simulateError(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	emitStatus(
		AUTO_UPDATE_STATUS.ERROR,
		undefined,
		"Simulated error for testing",
	);
}

export function setupAutoUpdater(): void {
	if (env.NODE_ENV === "development" || !IS_AUTO_UPDATE_PLATFORM) {
		return;
	}

	// Squirrel.Mac install failures happen in ShipIt out-of-process and never
	// reach the lib's `error` event, so route both the lib's internal logger
	// and our own handler narration through electron-log. Both halves of the
	// state machine end up interleaved in ~/Library/Logs/Rox/main.log —
	// always use `log.{info,warn,error}` here, not `console.*`.
	log.transports.file.level = "info";
	autoUpdater.logger = log;

	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.disableDifferentialDownload = true;

	// Allow downgrade for prerelease builds so users can switch back to stable
	autoUpdater.allowDowngrade = IS_PRERELEASE;

	// Use generic provider with explicit feed URL so electron-updater can request
	// the correct manifest for the current platform from GitHub release assets.
	autoUpdater.setFeedURL({
		provider: "generic",
		url: UPDATE_FEED_URL,
	});

	log.info(
		`[auto-updater] Initialized: version=${app.getVersion()}, channel=${IS_PRERELEASE ? "canary" : "stable"}, feedURL=${UPDATE_FEED_URL}`,
	);

	autoUpdater.on("error", (error) => {
		// Allow retry if Squirrel surfaces an error instead of actually quitting.
		isInstalling = false;
		if (isNetworkError(error)) {
			log.info("[auto-updater] Network unavailable, will retry later");
			emitStatus(AUTO_UPDATE_STATUS.IDLE);
			return;
		}
		if (isCodeSignatureError(error)) {
			// Unsigned build: Squirrel can't install, but we can still notify.
			// Flip to notify-only and surface a manual-download prompt instead of
			// going silent. Use the last known available version if we have one.
			notifyOnlyMode = true;
			const downloadUrl = getArchDownloadUrl();
			notifyOnlyDownloadUrl = downloadUrl;
			log.warn(
				"[auto-updater] Build is not code-signed; switching to notify-only manual download.",
			);
			emitStatus(
				AUTO_UPDATE_STATUS.UPDATE_AVAILABLE,
				currentVersion,
				undefined,
				{
					downloadUrl,
					notesUrl: RELEASES_URL,
				},
			);
			return;
		}
		log.error(
			`[auto-updater] Error during update (currentVersion=${app.getVersion()}):`,
			error?.message || error,
		);
		void clearCachedUpdate(`error: ${error?.message ?? "unknown"}`);
		emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
	});

	autoUpdater.on("checking-for-update", () => {
		log.info(
			`[auto-updater] Checking for updates... (currentVersion=${app.getVersion()}, feedURL=${UPDATE_FEED_URL})`,
		);
		emitStatus(AUTO_UPDATE_STATUS.CHECKING);
	});

	autoUpdater.on("update-available", (info) => {
		// In notify-only mode `runNotifyOnlyCheck` already emitted
		// UPDATE_AVAILABLE with the manual-download URL; don't override it with a
		// DOWNLOADING state for a Squirrel download that can't run on this build.
		if (notifyOnlyMode) {
			log.info(
				`[auto-updater] Update available (notify-only): ${app.getVersion()} → ${info.version}`,
			);
			return;
		}
		log.info(
			`[auto-updater] Update available: ${app.getVersion()} → ${info.version} (files: ${info.files?.map((f: { url: string }) => f.url).join(", ")})`,
		);
		emitStatus(AUTO_UPDATE_STATUS.DOWNLOADING, info.version);
	});

	autoUpdater.on("update-not-available", (info) => {
		log.info(
			`[auto-updater] No updates available (currentVersion=${app.getVersion()}, latestVersion=${info.version})`,
		);
		emitStatus(AUTO_UPDATE_STATUS.IDLE);
	});

	autoUpdater.on("download-progress", (progress) => {
		log.info(
			`[auto-updater] Download progress: ${progress.percent.toFixed(1)}% (${(progress.transferred / 1024 / 1024).toFixed(1)}MB / ${(progress.total / 1024 / 1024).toFixed(1)}MB)`,
		);
	});

	autoUpdater.on("update-downloaded", (info) => {
		log.info(
			`[auto-updater] Update downloaded: ${app.getVersion()} → ${info.version}. Ready to install.`,
		);
		emitStatus(AUTO_UPDATE_STATUS.READY, info.version);
	});

	const interval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
	interval.unref();

	if (app.isReady()) {
		void checkForUpdates();
	} else {
		app
			.whenReady()
			.then(() => checkForUpdates())
			.catch((error) => {
				log.error("[auto-updater] Failed to start update checks:", error);
			});
	}
}
