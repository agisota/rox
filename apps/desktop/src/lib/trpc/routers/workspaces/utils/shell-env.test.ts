import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyShellEnvToProcess,
	clearShellEnvCache,
	getProcessEnvWithShellEnv,
	getProcessEnvWithShellPath,
	getShellEnvironment,
} from "./shell-env";

describe("shell env merging", () => {
	test("getProcessEnvWithShellEnv fills in missing shell variables", async () => {
		const env = await getProcessEnvWithShellEnv(
			{
				PATH: "/usr/bin:/bin",
				NODE_ENV: "development",
			},
			{
				PATH: "/opt/homebrew/bin:/usr/bin:/bin",
				GITHUB_TOKEN: "ghp_test",
				GH_TOKEN: "ghp_alt",
			},
		);

		expect(env.PATH).toBe("/usr/bin:/bin");
		expect(env.NODE_ENV).toBe("development");
		expect(env.GITHUB_TOKEN).toBe("ghp_test");
		expect(env.GH_TOKEN).toBe("ghp_alt");
	});

	test("applyShellEnvToProcess preserves existing values", async () => {
		const targetEnv: NodeJS.ProcessEnv = {
			NODE_ENV: "production",
			GITHUB_TOKEN: "existing-token",
		};

		await applyShellEnvToProcess(targetEnv, {
			NODE_ENV: "development",
			GITHUB_TOKEN: "shell-token",
			GH_TOKEN: "shell-gh-token",
		});

		expect(targetEnv.NODE_ENV).toBe("production");
		expect(targetEnv.GITHUB_TOKEN).toBe("existing-token");
		expect(targetEnv.GH_TOKEN).toBe("shell-gh-token");
	});

	test("applyShellEnvToProcess ignores empty shell env input", async () => {
		const targetEnv: NodeJS.ProcessEnv = {};

		await applyShellEnvToProcess(targetEnv, {});

		expect(targetEnv).toEqual({});
	});
});

describe("getProcessEnvWithShellPath preserves user git env vars", () => {
	test("keeps pager and editor variables in the returned env", async () => {
		const env = await getProcessEnvWithShellPath({
			PATH: "/usr/bin:/bin",
			EDITOR: "vim",
			GIT_EDITOR: "vim",
			PAGER: "less",
			GIT_PAGER: "less",
		});

		expect(env.EDITOR).toBe("vim");
		expect(env.GIT_EDITOR).toBe("vim");
		expect(env.PAGER).toBe("less");
		expect(env.GIT_PAGER).toBe("less");
	}, 10_000);
});

describe("shell env cache", () => {
	test("longer timeout bypasses timeout fallback cache", async () => {
		const key = "__ROX_SHELL_ENV_BACKGROUND_REFRESH_TEST__";
		const originalValue = process.env[key];
		process.env[key] = "fallback";
		clearShellEnvCache();

		try {
			const fallbackEnv = await getShellEnvironment({ timeoutMs: 0 });
			expect(fallbackEnv[key]).toBe("fallback");

			process.env[key] = "fresh";
			const refreshedEnv = await getShellEnvironment({ timeoutMs: 10_000 });
			expect(refreshedEnv[key]).toBe("fresh");
		} finally {
			if (originalValue === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = originalValue;
			}
			clearShellEnvCache();
		}
	}, 12_000);

	test("getShellEnvironment forceRefresh bypasses cached values", async () => {
		const zshPath = ["/bin/zsh", "/usr/bin/zsh"].find((candidate) =>
			existsSync(candidate),
		);
		if (!zshPath) {
			return;
		}

		const tmpDir = mkdtempSync(
			join(realpathSync(tmpdir()), "shell-env-refresh-test-"),
		);
		const zshrcPath = join(tmpDir, ".zshrc");
		writeFileSync(zshrcPath, 'export __ROX_SHELL_ENV_REFRESH_TEST__="first"\n');

		const origZDOTDIR = process.env.ZDOTDIR;
		const origShell = process.env.SHELL;
		process.env.SHELL = zshPath;
		process.env.ZDOTDIR = tmpDir;
		clearShellEnvCache();

		try {
			const cachedEnv = await getShellEnvironment();
			expect(cachedEnv.__ROX_SHELL_ENV_REFRESH_TEST__).toBe("first");

			writeFileSync(
				zshrcPath,
				'export __ROX_SHELL_ENV_REFRESH_TEST__="second"\n',
			);

			const stillCachedEnv = await getShellEnvironment();
			expect(stillCachedEnv.__ROX_SHELL_ENV_REFRESH_TEST__).toBe("first");

			const refreshedEnv = await getShellEnvironment({ forceRefresh: true });
			expect(refreshedEnv.__ROX_SHELL_ENV_REFRESH_TEST__).toBe("second");
		} finally {
			if (origZDOTDIR !== undefined) process.env.ZDOTDIR = origZDOTDIR;
			else delete process.env.ZDOTDIR;
			if (origShell !== undefined) process.env.SHELL = origShell;
			else delete process.env.SHELL;
			clearShellEnvCache();
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
