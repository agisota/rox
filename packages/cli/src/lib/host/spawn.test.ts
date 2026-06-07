import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiClient } from "../api-client";

const originalFetch = globalThis.fetch;
const originalRoxHomeDir = process.env.ROX_HOME_DIR;
const originalHostBin = process.env.ROX_HOST_BIN;
const tempHome = mkdtempSync(join(tmpdir(), "rox-cli-spawn-"));
const hostBin = join(tempHome, "rox-host");

process.env.ROX_HOME_DIR = tempHome;
process.env.ROX_HOST_BIN = hostBin;
writeFileSync(hostBin, "");

type SpawnOptions = {
	env?: NodeJS.ProcessEnv;
	detached?: boolean;
	stdio?: unknown;
};

const spawnCalls: Array<{
	command: string;
	args: string[];
	options: SpawnOptions;
}> = [];

const spawnMock = mock(
	(command: string, args: string[], options: SpawnOptions) => {
		spawnCalls.push({ command, args, options });
		return {
			pid: 12345,
			kill: mock(() => undefined),
			unref: mock(() => undefined),
		};
	},
);

mock.module("node:child_process", () => ({
	spawn: spawnMock,
}));

const { ROX_CONFIG_PATH } = await import("../config");
const { spawnHostService } = await import("./spawn");

function createApi(): ApiClient {
	return {
		analytics: {
			featureFlagPayload: {
				query: async () => null,
			},
		},
	} as unknown as ApiClient;
}

afterEach(() => {
	spawnCalls.length = 0;
	spawnMock.mockClear();
	globalThis.fetch = originalFetch;
});

afterAll(() => {
	rmSync(tempHome, { recursive: true, force: true });
	if (originalRoxHomeDir === undefined) {
		delete process.env.ROX_HOME_DIR;
	} else {
		process.env.ROX_HOME_DIR = originalRoxHomeDir;
	}
	if (originalHostBin === undefined) {
		delete process.env.ROX_HOST_BIN;
	} else {
		process.env.ROX_HOST_BIN = originalHostBin;
	}
});

describe("spawnHostService", () => {
	test("passes ROX_AUTH_CONFIG_PATH when provided", async () => {
		globalThis.fetch = mock(
			async () => new Response("ok", { status: 200 }),
		) as unknown as typeof fetch;

		await spawnHostService({
			organizationId: "00000000-0000-0000-0000-000000000001",
			sessionToken: "session-token",
			authConfigPath: ROX_CONFIG_PATH,
			api: createApi(),
			port: 54879,
			daemon: true,
		});

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnCalls[0]?.options.env?.ROX_AUTH_CONFIG_PATH).toBe(
			ROX_CONFIG_PATH,
		);
		expect(spawnCalls[0]?.options.env?.AUTH_TOKEN).toBe("session-token");
	});
});
