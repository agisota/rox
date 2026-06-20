// Process/PID helpers for DaemonSupervisor. These are pure, standalone
// functions with no supervisor state — they operate purely on pids,
// signals, and streams. Extracted from DaemonSupervisor.ts to keep that
// file focused on supervision/lifecycle logic.

import {
	isPositiveInteger,
	signalProcessTreeAndGroups,
} from "@rox/pty-daemon/process-tree";
import type { SessionInfo } from "@rox/pty-daemon/protocol";

export const DAEMON_TERMINATE_TIMEOUT_MS = 1_000;

/**
 * Forward child stdout/stderr to a parent stream with a per-line prefix.
 * Plain `chunk => parent.write(`${tag} ${chunk}`)` only prefixes the first
 * line in a chunk; bursts of multi-line output lose the prefix on
 * subsequent lines.
 */
export function pipeWithPrefix(
	source: NodeJS.ReadableStream,
	target: NodeJS.WritableStream,
	tag: string,
): void {
	let pending = "";
	source.on("data", (chunk: Buffer) => {
		const text = pending + chunk.toString("utf8");
		const lines = text.split("\n");
		pending = lines.pop() ?? "";
		for (const line of lines) {
			target.write(`${tag} ${line}\n`);
		}
	});
	source.on("end", () => {
		if (pending) target.write(`${tag} ${pending}\n`);
		pending = "";
	});
}

export function countAliveSessions(sessions: SessionInfo[]): number {
	return sessions.filter((session) => session.alive).length;
}

export function terminatePidOnly(pid: number, signal: NodeJS.Signals): void {
	if (!isPositiveInteger(pid)) return;
	try {
		process.kill(pid, signal);
	} catch {
		// Already dead or not ours.
	}
}

export async function terminateProcessTreeAndGroups(
	pid: number,
	signal: NodeJS.Signals,
): Promise<void> {
	if (!isPositiveInteger(pid)) return;
	signalProcessTreeAndGroups(pid, signal);
	if (await waitForPidExit(pid, DAEMON_TERMINATE_TIMEOUT_MS)) return;
	signalProcessTreeAndGroups(pid, "SIGKILL");
	await waitForPidExit(pid, DAEMON_TERMINATE_TIMEOUT_MS);
}

/**
 * Poll `kill(pid, 0)` until the process is gone or the deadline hits.
 * Returns `true` if we observed exit, `false` on timeout. Used to gate
 * a post-handoff version probe on predecessor exit — without this gate,
 * the probe can connect to the still-alive predecessor and record its
 * (old) version as the successor's, leaving updatePending true.
 *
 * On timeout the caller should treat the update as failed: the predecessor
 * is wedged, we can't reliably tell whether the successor bound, and
 * pretending to succeed would silently corrupt the supervisor's view.
 */
export async function waitForPidExit(
	pid: number,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			process.kill(pid, 0);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ESRCH") return true;
			// EPERM: process exists but isn't ours — keep waiting.
		}
		await new Promise((r) => setTimeout(r, 25));
	}
	return false;
}
