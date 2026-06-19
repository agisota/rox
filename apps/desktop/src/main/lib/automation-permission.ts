import { execFile } from "node:child_process";
import {
	AUTOMATION_TARGETS,
	isKnownAutomationTarget,
} from "./automation-targets";

/**
 * Requests macOS Automation (Apple Events) access for specific target apps.
 *
 * macOS only shows the "Rox wants to control <App>" consent dialog — and only
 * creates the per-target row in System Settings ▸ Privacy & Security ▸
 * Automation — the first time Rox sends an Apple Event to that target. We send a
 * benign read-only event (`get name`) via `osascript`. Because `osascript` is
 * spawned by the signed, hardened Rox binary (which carries
 * `com.apple.security.automation.apple-events` + `NSAppleEventsUsageDescription`),
 * TCC attributes the request to Rox and the row is created as "Rox → <App>".
 *
 * Status reading is intentionally NOT implemented: macOS exposes no reliable
 * read API for per-target Apple Events authorization without sending an event
 * (and sending one can launch a non-running target). Automation therefore stays
 * "request-only", matching the prior design. A future native helper calling
 * AEDeterminePermissionToAutomateTarget(askUserIfNeeded:false) could add status.
 */

/** Default per-target timeout. A consent dialog blocks osascript until the user
 * answers; keep this generous so a real prompt isn't killed mid-decision. */
const REQUEST_TIMEOUT_MS = 120_000;

export interface AutomationRequestResult {
	bundleId: string;
	/** True when the Apple Event dispatched without an authorization/runtime error. */
	granted: boolean;
	/** Raw error message when not granted (denied, not installed, timed out, etc.). */
	error?: string;
}

type ExecFileImpl = (
	file: string,
	args: string[],
	options: { timeout: number },
	callback: (
		error: (Error & { code?: number | string }) | null,
		stdout: string,
		stderr: string,
	) => void,
) => void;

function defaultExecFile(): ExecFileImpl {
	return execFile as unknown as ExecFileImpl;
}

/**
 * Send one benign Apple Event to a target to trigger its TCC consent prompt and
 * register the Automation pane row. Resolves (never rejects) with the outcome.
 */
export function requestAutomationForTarget(
	bundleId: string,
	{
		platform = process.platform,
		execFileImpl = defaultExecFile(),
		timeoutMs = REQUEST_TIMEOUT_MS,
	}: {
		platform?: NodeJS.Platform | string;
		execFileImpl?: ExecFileImpl;
		timeoutMs?: number;
	} = {},
): Promise<AutomationRequestResult> {
	if (platform !== "darwin") {
		return Promise.resolve({
			bundleId,
			granted: false,
			error: "not-darwin",
		});
	}

	// Addressing the target by bundle id keeps the script app-name agnostic.
	const script = `tell application id "${bundleId}" to get its name`;

	return new Promise((resolve) => {
		execFileImpl(
			"osascript",
			["-e", script],
			{ timeout: timeoutMs },
			(error) => {
				if (!error) {
					resolve({ bundleId, granted: true });
					return;
				}
				resolve({
					bundleId,
					granted: false,
					error: error.message,
				});
			},
		);
	});
}

/**
 * Per-target timeout for the bulk "request all" path. Shorter than the
 * single-target timeout: a dialog the user is actively dismissing resolves
 * fast, and a stuck/unresponsive target must not hold the whole sequence
 * hostage (8 × 120s ≈ 16 min). This bounds the worst case to ~4 min.
 */
const BULK_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Request automation for every known target, sequentially, so the macOS consent
 * dialogs queue one-at-a-time (firing all at once is incomprehensible to users).
 * Returns the per-target outcomes.
 */
export async function requestAllAutomationTargets(
	options: {
		platform?: NodeJS.Platform | string;
		execFileImpl?: ExecFileImpl;
		timeoutMs?: number;
	} = {},
): Promise<AutomationRequestResult[]> {
	const perTarget = {
		...options,
		timeoutMs: options.timeoutMs ?? BULK_REQUEST_TIMEOUT_MS,
	};
	const results: AutomationRequestResult[] = [];
	for (const target of AUTOMATION_TARGETS) {
		results.push(await requestAutomationForTarget(target.bundleId, perTarget));
	}
	return results;
}

/** Guard used by the tRPC layer so only registry bundle ids are dispatched. */
export function assertKnownAutomationTarget(bundleId: string): void {
	if (!isKnownAutomationTarget(bundleId)) {
		throw new Error(`Unknown automation target: ${bundleId}`);
	}
}
