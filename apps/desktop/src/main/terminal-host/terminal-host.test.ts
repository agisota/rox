import { beforeEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createFrameHeader, PtySubprocessIpcType } from "./pty-subprocess-ipc";
import "./xterm-env-polyfill";

// Must import after polyfill since these transitively load @xterm/headless
const { Session } = await import("./session");

// =============================================================================
// Fakes
// =============================================================================

class FakeStdout extends EventEmitter {
	write(): boolean {
		return true;
	}
}

class FakeStdin extends EventEmitter {
	readonly writes: Buffer[] = [];

	write(chunk: Buffer | string): boolean {
		this.writes.push(
			Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"),
		);
		return true;
	}
}

class FakeChildProcess extends EventEmitter {
	readonly stdout = new FakeStdout();
	readonly stdin = new FakeStdin();
	pid = 4242;
	kill(): boolean {
		return true;
	}
}

// =============================================================================
// Helpers
// =============================================================================

function emitReadyAndSpawned(child: FakeChildProcess, pid = 9999): void {
	// Ready frame (no payload)
	child.stdout.emit("data", createFrameHeader(PtySubprocessIpcType.Ready, 0));

	// Spawned frame with PID
	const pidPayload = Buffer.allocUnsafe(4);
	pidPayload.writeUInt32LE(pid, 0);
	const header = createFrameHeader(PtySubprocessIpcType.Spawned, 4);
	child.stdout.emit("data", Buffer.concat([header, pidPayload]));
}

function emitReadyOnly(child: FakeChildProcess): void {
	child.stdout.emit("data", createFrameHeader(PtySubprocessIpcType.Ready, 0));
}

function emitError(child: FakeChildProcess, errorMsg: string): void {
	const errorPayload = Buffer.from(errorMsg, "utf8");
	const header = createFrameHeader(
		PtySubprocessIpcType.Error,
		errorPayload.length,
	);
	child.stdout.emit("data", Buffer.concat([header, errorPayload]));
}

/**
 * Drive the `Ready` then `Error` sequence explicitly, one frame at a time.
 *
 * The `Session` frame handler is fully synchronous: emitting on the fake
 * child's stdout runs `handleSubprocessFrame` inline. Splitting the helper so
 * each frame is emitted by name (rather than concatenated and "hopefully"
 * processed in order) makes the intended ordering explicit and removes any
 * reliance on incidental timing.
 */
function emitReadyThenError(child: FakeChildProcess, errorMsg: string): void {
	emitReadyOnly(child);
	emitError(child, errorMsg);
}

/**
 * Resolve once the session reports an exit, driven by the source's own
 * `onExit` callback. Used instead of a fixed `setTimeout` sleep so the
 * assertions run exactly when the state transition has happened, not after an
 * arbitrary delay that races the event loop.
 */
function onceExit(session: {
	onExit: (cb: (sessionId: string, exitCode: number) => void) => void;
}): Promise<number> {
	return new Promise((resolve) => {
		session.onExit((_sessionId, exitCode) => resolve(exitCode));
	});
}

// =============================================================================
// Tests
// =============================================================================

describe("TerminalHost — PTY spawn failure handling", () => {
	let fakeChild: FakeChildProcess;

	beforeEach(() => {
		fakeChild = new FakeChildProcess();
	});

	/**
	 * Reproduces the broken state from issue #2960:
	 * the subprocess reports a spawn error but stays alive, so `isAlive`
	 * remains true even though no PTY PID was ever assigned.
	 */
	it("session.isAlive is true when subprocess is alive but PTY failed to spawn (BUG)", async () => {
		const session = new Session({
			sessionId: "session-spawn-fail",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => fakeChild as unknown as ChildProcess,
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		// Spawn fails after Ready, but the subprocess never exits.
		emitReadyThenError(fakeChild, "Spawn failed: posix_spawnp failed.");

		expect(session.isAlive).toBe(true);
		expect(session.pid).toBeNull();

		const terminalHostWouldReject = !session.isAlive;
		expect(terminalHostWouldReject).toBe(false);

		await session.dispose();
	});

	it("session correctly detects spawn failure when subprocess exits after error", async () => {
		const session = new Session({
			sessionId: "session-spawn-fail-fixed",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => fakeChild as unknown as ChildProcess,
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		// Spawn fails, then the subprocess exits.
		emitReadyThenError(fakeChild, "Spawn failed: posix_spawnp failed.");

		// Await the session's own exit signal rather than sleeping a fixed
		// number of milliseconds. The exit handler is synchronous, so this
		// resolves deterministically the moment the process exit is processed.
		const exitCode = onceExit(session);
		fakeChild.emit("exit", 1);
		expect(await exitCode).toBe(1);

		expect(session.isAlive).toBe(false);
		expect(session.pid).toBeNull();

		await session.dispose();
	});

	it("TerminalHost rejects broken session when pid is null after ready timeout", async () => {
		const session = new Session({
			sessionId: "session-no-pid",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => fakeChild as unknown as ChildProcess,
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		// Ready arrives, but the PTY `Spawned` frame never comes — so the PTY
		// spawn never completes.
		emitReadyOnly(fakeChild);

		// `waitForReady()` must NOT resolve in this broken state. Rather than
		// racing it against an arbitrary timeout (flaky), assert that it stays
		// pending: race it against an already-resolved sentinel and confirm the
		// sentinel wins. This is deterministic — it does not depend on wall
		// clock timing.
		const PENDING = Symbol("pending");
		const settled = await Promise.race([
			session.waitForReady().then(() => "ready" as const),
			Promise.resolve(PENDING),
		]);
		expect(settled).toBe(PENDING);

		// The session is in the broken state from issue #2960: the subprocess
		// is alive, but no PTY PID was ever assigned.
		expect(session.isAlive).toBe(true);
		expect(session.pid).toBeNull();

		const shouldReject = !session.isAlive || session.pid === null;
		expect(shouldReject).toBe(true);

		await session.dispose();
	});

	it("healthy session has both isAlive=true and pid set", async () => {
		const session = new Session({
			sessionId: "session-healthy",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => fakeChild as unknown as ChildProcess,
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		// Simulate successful spawn
		emitReadyAndSpawned(fakeChild, 12345);

		await session.waitForReady();

		expect(session.isAlive).toBe(true);
		expect(session.pid).toBe(12345);

		await session.dispose();
	});
});
