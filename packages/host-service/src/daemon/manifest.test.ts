import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	listPtyDaemonManifests,
	type PtyDaemonManifest,
	readPtyDaemonManifest,
	removePtyDaemonManifest,
	writePtyDaemonManifest,
} from "./manifest.ts";

const TEST_HOME = path.join(os.tmpdir(), `rox-manifest-test-${process.pid}`);
const LEGACY_TEST_HOME = path.join(
	os.tmpdir(),
	`.rox-manifest-test-${process.pid}`,
);
const TEST_ORG = "org-manifest-test";

beforeEach(() => {
	process.env.ROX_HOME_DIR = TEST_HOME;
	fs.mkdirSync(TEST_HOME, { recursive: true });
});

afterEach(() => {
	removePtyDaemonManifest(TEST_ORG);
	fs.rmSync(TEST_HOME, { recursive: true, force: true });
	fs.rmSync(LEGACY_TEST_HOME, { recursive: true, force: true });
	process.env.ROX_HOME_DIR = undefined;
});

function baseManifest(): PtyDaemonManifest {
	return {
		pid: 12345,
		socketPath: "/tmp/test.sock",
		protocolVersions: [1],
		startedAt: 1700000000000,
		organizationId: TEST_ORG,
	};
}

describe("PtyDaemonManifest", () => {
	test("write + read round-trips required fields", () => {
		writePtyDaemonManifest(baseManifest());
		expect(readPtyDaemonManifest(TEST_ORG)).toEqual(baseManifest());
	});

	test("write + read round-trips Phase 2 handoff fields", () => {
		const manifest: PtyDaemonManifest = {
			...baseManifest(),
			handoffInProgress: true,
			handoffSnapshotPath: "/tmp/handoff-snapshot.json",
			handoffSuccessorPid: 99999,
		};
		writePtyDaemonManifest(manifest);
		expect(readPtyDaemonManifest(TEST_ORG)).toEqual(manifest);
	});

	test("read tolerates extra unknown fields (forward-compat)", () => {
		const dir = path.join(TEST_HOME, "host", TEST_ORG);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "pty-daemon-manifest.json"),
			JSON.stringify({ ...baseManifest(), futureField: "something" }),
		);
		const out = readPtyDaemonManifest(TEST_ORG);
		expect(out).not.toBeNull();
		expect(out?.pid).toBe(12345);
	});

	test("read drops malformed handoff fields silently", () => {
		const dir = path.join(TEST_HOME, "host", TEST_ORG);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "pty-daemon-manifest.json"),
			JSON.stringify({
				...baseManifest(),
				handoffInProgress: "not-a-boolean",
				handoffSuccessorPid: "not-a-number",
			}),
		);
		const out = readPtyDaemonManifest(TEST_ORG);
		expect(out).not.toBeNull();
		expect(out?.handoffInProgress).toBeUndefined();
		expect(out?.handoffSuccessorPid).toBeUndefined();
	});

	test("read returns null when required fields are missing", () => {
		const dir = path.join(TEST_HOME, "host", TEST_ORG);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "pty-daemon-manifest.json"),
			JSON.stringify({ pid: 1 }),
		);
		expect(readPtyDaemonManifest(TEST_ORG)).toBeNull();
	});

	test("reads, lists, and removes a matching legacy home manifest", () => {
		const dir = path.join(LEGACY_TEST_HOME, "host", TEST_ORG);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "pty-daemon-manifest.json"),
			JSON.stringify(baseManifest()),
		);

		expect(readPtyDaemonManifest(TEST_ORG)).toEqual(baseManifest());
		expect(listPtyDaemonManifests()).toEqual([baseManifest()]);

		removePtyDaemonManifest(TEST_ORG);
		expect(readPtyDaemonManifest(TEST_ORG)).toBeNull();
	});

	test("falls back to a valid legacy manifest when current manifest is malformed", () => {
		const currentDir = path.join(TEST_HOME, "host", TEST_ORG);
		const legacyDir = path.join(LEGACY_TEST_HOME, "host", TEST_ORG);
		fs.mkdirSync(currentDir, { recursive: true });
		fs.mkdirSync(legacyDir, { recursive: true });
		fs.writeFileSync(
			path.join(currentDir, "pty-daemon-manifest.json"),
			JSON.stringify({ pid: 1 }),
		);
		fs.writeFileSync(
			path.join(legacyDir, "pty-daemon-manifest.json"),
			JSON.stringify(baseManifest()),
		);

		expect(readPtyDaemonManifest(TEST_ORG)).toEqual(baseManifest());
	});
});
