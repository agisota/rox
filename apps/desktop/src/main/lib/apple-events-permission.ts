import { execFile } from "node:child_process";
import { logger } from "main/lib/logger";
import { AUTOMATION_PERMISSIONS_ENABLED } from "./automation-targets";

/**
 * Triggers the macOS Apple Events / Automation permission prompt by
 * sending a minimal AppleScript command to System Events.
 * This is a no-op on non-macOS platforms.
 *
 * Gated behind {@link AUTOMATION_PERMISSIONS_ENABLED}: until a Developer ID
 * signed build exists, sending Apple Events is pointless (TCC denies on
 * unsigned/ad-hoc builds) so we skip it entirely at boot.
 *
 * On macOS (when enabled), this will cause the system to show the "would like to
 * access data from other apps" dialog if it hasn't been granted yet.
 * Once granted, the permission is remembered and the dialog won't reappear.
 */
export function requestAppleEventsAccess(): void {
	if (!AUTOMATION_PERMISSIONS_ENABLED) {
		return;
	}
	if (process.platform !== "darwin") {
		return;
	}

	execFile(
		"osascript",
		["-e", 'tell application "System Events" to return 1'],
		(err) => {
			if (err) {
				logger.info(
					"[apple-events] Permission request error (expected if denied):",
					err.message,
				);
			} else {
				logger.info("[apple-events] Apple Events access granted");
			}
		},
	);
}
