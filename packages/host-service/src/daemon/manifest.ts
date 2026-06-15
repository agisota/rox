// Manifest for a running pty-daemon instance. Lives under
// $ROX_HOME_DIR/host/{organizationId}/. Different lifecycle from
// host-service's own manifest — the daemon outlives host-service restarts.

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROX_HOME_DIR_NAME } from "@rox/shared/rox-dirs";
import { legacyRoxHomeDirFor } from "@rox/shared/rox-dirs-node";

export interface PtyDaemonManifest {
	pid: number;
	socketPath: string;
	protocolVersions: number[];
	startedAt: number;
	organizationId: string;
	// ----- Phase 2 (daemon-binary upgrade fd-handoff) -----
	// All present only during the brief handoff window. Older host-service
	// builds that don't know these fields ignore them harmlessly.
	/** True between predecessor's snapshot-write and successor's bind. */
	handoffInProgress?: boolean;
	/** Path of the on-disk handoff snapshot the successor will read. */
	handoffSnapshotPath?: string;
	/** PID of the spawned successor; pre-bind, supervisor uses this to track. */
	handoffSuccessorPid?: number;
}

function roxHomeDir(): string {
	return process.env.ROX_HOME_DIR || join(homedir(), ROX_HOME_DIR_NAME);
}

function roxHomeDirsForRead(): string[] {
	const primary = roxHomeDir();
	const legacy = legacyRoxHomeDirFor(primary);
	return legacy && legacy !== primary ? [primary, legacy] : [primary];
}

export function ptyDaemonManifestDir(organizationId: string): string {
	return join(roxHomeDir(), "host", organizationId);
}

function ptyDaemonManifestPath(organizationId: string): string {
	return join(ptyDaemonManifestDir(organizationId), "pty-daemon-manifest.json");
}

function ptyDaemonManifestPathsForRead(organizationId: string): string[] {
	return roxHomeDirsForRead().map((homeDir) =>
		join(homeDir, "host", organizationId, "pty-daemon-manifest.json"),
	);
}

export function writePtyDaemonManifest(manifest: PtyDaemonManifest): void {
	const dir = ptyDaemonManifestDir(manifest.organizationId);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	writeFileSync(
		ptyDaemonManifestPath(manifest.organizationId),
		JSON.stringify(manifest),
		{ encoding: "utf-8", mode: 0o600 },
	);
}

export function readPtyDaemonManifest(
	organizationId: string,
): PtyDaemonManifest | null {
	for (const filePath of ptyDaemonManifestPathsForRead(organizationId)) {
		if (!existsSync(filePath)) continue;
		const manifest = readPtyDaemonManifestFile(filePath);
		if (manifest) return manifest;
	}
	return null;
}

function readPtyDaemonManifestFile(filePath: string): PtyDaemonManifest | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const data = JSON.parse(raw);
		if (
			typeof data.pid !== "number" ||
			typeof data.socketPath !== "string" ||
			!Array.isArray(data.protocolVersions) ||
			typeof data.startedAt !== "number" ||
			typeof data.organizationId !== "string"
		) {
			return null;
		}
		// Phase 2 fields are optional. If present, they must have the right
		// shape; otherwise drop them silently rather than rejecting the whole
		// manifest — these fields are advisory state and missing/garbage
		// values shouldn't make the daemon unrecoverable.
		const out: PtyDaemonManifest = {
			pid: data.pid,
			socketPath: data.socketPath,
			protocolVersions: data.protocolVersions,
			startedAt: data.startedAt,
			organizationId: data.organizationId,
		};
		if (typeof data.handoffInProgress === "boolean") {
			out.handoffInProgress = data.handoffInProgress;
		}
		if (typeof data.handoffSnapshotPath === "string") {
			out.handoffSnapshotPath = data.handoffSnapshotPath;
		}
		if (typeof data.handoffSuccessorPid === "number") {
			out.handoffSuccessorPid = data.handoffSuccessorPid;
		}
		return out;
	} catch {
		return null;
	}
}

export function listPtyDaemonManifests(): PtyDaemonManifest[] {
	const manifestsByOrg = new Map<string, PtyDaemonManifest>();
	try {
		for (const homeDir of roxHomeDirsForRead()) {
			const hostDir = join(homeDir, "host");
			if (!existsSync(hostDir)) continue;
			for (const entry of readdirSync(hostDir, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				if (manifestsByOrg.has(entry.name)) continue;
				const manifest = readPtyDaemonManifest(entry.name);
				if (manifest) manifestsByOrg.set(entry.name, manifest);
			}
		}
	} catch {
		// best-effort
	}
	return Array.from(manifestsByOrg.values());
}

export function removePtyDaemonManifest(organizationId: string): void {
	for (const filePath of ptyDaemonManifestPathsForRead(organizationId)) {
		try {
			if (existsSync(filePath)) unlinkSync(filePath);
		} catch {
			// best-effort
		}
	}
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}
