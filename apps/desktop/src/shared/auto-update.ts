export const AUTO_UPDATE_STATUS = {
	IDLE: "idle",
	CHECKING: "checking",
	DOWNLOADING: "downloading",
	READY: "ready",
	ERROR: "error",
	// Notify-only state for unsigned macOS builds: a newer version exists but
	// Squirrel.Mac cannot auto-install it (no Apple Developer ID), so we surface
	// a manual-download prompt instead of downloading in the background.
	UPDATE_AVAILABLE: "update-available",
} as const;

export type AutoUpdateStatus =
	(typeof AUTO_UPDATE_STATUS)[keyof typeof AUTO_UPDATE_STATUS];

export const RELEASES_URL = "https://github.com/agisota/rox/releases";
