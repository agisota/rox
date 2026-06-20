// Socket-level probe helpers for DaemonSupervisor. These are pure,
// standalone functions: they own their socket lifecycle on every exit
// path and hold no supervisor state. Extracted from DaemonSupervisor.ts
// to keep that file focused on supervision/lifecycle logic.

import * as fs from "node:fs";
import * as net from "node:net";
import {
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
	type ServerMessage,
	type SessionInfo,
} from "@rox/pty-daemon/protocol";

export interface DaemonProbeResult {
	daemonVersion: string;
	daemonPid?: number;
}

const VERSION_PROBE_TIMEOUT_MS = 1_500;

export async function waitForSocket(
	socketPath: string,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (fs.existsSync(socketPath)) {
			if (await isSocketConnectable(socketPath, 200)) return true;
		}
		await new Promise((r) => setTimeout(r, 50));
	}
	return false;
}

/**
 * One-shot session list: connect, do handshake, send `list`, return the
 * sessions array. Returns null on any failure.
 *
 * Owns its socket lifecycle on every exit path.
 */
export async function listDaemonSessions(
	socketPath: string,
	timeoutMs: number,
): Promise<SessionInfo[] | null> {
	return new Promise<SessionInfo[] | null>((resolve) => {
		const sock = net.createConnection({ path: socketPath });
		const decoder = new FrameDecoder();
		let helloAcked = false;
		let settled = false;

		const cleanup = (value: SessionInfo[] | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			sock.removeAllListeners();
			try {
				sock.end();
			} catch {
				// best-effort
			}
			try {
				sock.destroy();
			} catch {
				// best-effort
			}
			resolve(value);
		};

		const timer = setTimeout(() => cleanup(null), timeoutMs);

		sock.once("error", () => cleanup(null));
		sock.once("close", () => cleanup(null));

		sock.once("connect", () => {
			try {
				sock.write(
					encodeFrame({
						type: "hello",
						protocols: [CURRENT_PROTOCOL_VERSION],
						clientVersion: "supervisor-list",
					}),
				);
			} catch {
				cleanup(null);
			}
		});

		sock.on("data", (chunk: Buffer) => {
			try {
				decoder.push(chunk);
				for (const decoded of decoder.drain()) {
					const msg = decoded.message as ServerMessage;
					if (!helloAcked) {
						if (msg.type !== "hello-ack") {
							cleanup(null);
							return;
						}
						helloAcked = true;
						sock.write(encodeFrame({ type: "list" }));
						continue;
					}
					if (msg.type === "list-reply") {
						cleanup(msg.sessions);
						return;
					}
					if (msg.type === "error") {
						cleanup(null);
						return;
					}
				}
			} catch {
				cleanup(null);
			}
		});
	});
}

/**
 * Retry probeDaemonVersion through the post-handoff bind window. The
 * successor calls `listenWithRetry` only after the predecessor's IPC
 * channel disconnects (= predecessor exited), so there's a brief gap
 * between predecessor death and successor bind where any probe sees
 * ECONNREFUSED. A single probe with a long timeout still fails because
 * `probeDaemonVersion` resolves to null on the first connect-error;
 * we have to actively retry.
 */
export async function probeDaemonHelloWithRetry(
	socketPath: string,
	totalTimeoutMs: number,
): Promise<DaemonProbeResult | null> {
	const deadline = Date.now() + totalTimeoutMs;
	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		const perAttempt = Math.min(remaining, VERSION_PROBE_TIMEOUT_MS);
		const probe = await probeDaemonHello(socketPath, perAttempt);
		if (probe !== null) return probe;
		await new Promise((r) => setTimeout(r, 50));
	}
	return null;
}

export async function probeDaemonVersionWithRetry(
	socketPath: string,
	totalTimeoutMs: number,
): Promise<string | null> {
	return (
		(await probeDaemonHelloWithRetry(socketPath, totalTimeoutMs))
			?.daemonVersion ?? null
	);
}

/**
 * One-shot version probe: connect, send `hello`, read framed `hello-ack`,
 * close, return `daemonVersion`. Returns null on any failure.
 *
 * Owns its socket lifecycle on every exit path.
 */
export async function probeDaemonVersion(
	socketPath: string,
	timeoutMs: number,
): Promise<string | null> {
	return (await probeDaemonHello(socketPath, timeoutMs))?.daemonVersion ?? null;
}

export function probeDaemonHello(
	socketPath: string,
	timeoutMs: number,
): Promise<DaemonProbeResult | null> {
	return new Promise<DaemonProbeResult | null>((resolve) => {
		const sock = net.createConnection({ path: socketPath });
		const decoder = new FrameDecoder();
		let settled = false;

		const cleanup = (value: DaemonProbeResult | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			sock.removeAllListeners();
			try {
				sock.end();
			} catch {
				// best-effort
			}
			try {
				sock.destroy();
			} catch {
				// best-effort
			}
			resolve(value);
		};

		const timer = setTimeout(() => cleanup(null), timeoutMs);

		sock.once("error", () => cleanup(null));
		sock.once("close", () => cleanup(null));

		sock.once("connect", () => {
			try {
				sock.write(
					encodeFrame({
						type: "hello",
						protocols: [CURRENT_PROTOCOL_VERSION],
						clientVersion: "supervisor-probe",
					}),
				);
			} catch {
				cleanup(null);
			}
		});

		sock.on("data", (chunk: Buffer) => {
			try {
				decoder.push(chunk);
				for (const decoded of decoder.drain()) {
					const msg = decoded.message as ServerMessage;
					if (msg.type === "hello-ack") {
						const daemonVersion = msg.daemonVersion;
						if (!daemonVersion) {
							cleanup(null);
							return;
						}
						cleanup({
							daemonVersion,
							daemonPid: msg.daemonPid,
						});
						return;
					}
					cleanup(null);
					return;
				}
			} catch {
				cleanup(null);
			}
		});
	});
}

export function isSocketConnectable(
	socketPath: string,
	timeoutMs: number,
): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const sock = net.createConnection({ path: socketPath });
		const timer = setTimeout(() => {
			sock.destroy();
			resolve(false);
		}, timeoutMs);
		sock.once("connect", () => {
			clearTimeout(timer);
			sock.end();
			resolve(true);
		});
		sock.once("error", () => {
			clearTimeout(timer);
			resolve(false);
		});
	});
}
