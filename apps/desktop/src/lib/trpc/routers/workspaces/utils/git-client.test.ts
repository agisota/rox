import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SIMPLE_GIT_UNSAFE_OPTION_FLAGS,
	USER_GIT_ENV_SIMPLE_GIT_OPTIONS,
} from "@rox/shared/simple-git-options";
import simpleGit, { type SimpleGit } from "simple-git";
import {
	execGitWithShellPath,
	resetGitBinaryResolutionCache,
	resolveGitBinary,
} from "./git-client";

function makeBlockedGitEnv(workRoot: string): Record<string, string> {
	const globalConfig = join(workRoot, "global.gitconfig");
	const systemConfig = join(workRoot, "system.gitconfig");
	const configFile = join(workRoot, "gitconfig");
	const templateDir = join(workRoot, "template");
	mkdirSync(templateDir);
	writeFileSync(globalConfig, "");
	writeFileSync(systemConfig, "");
	writeFileSync(configFile, "");

	return {
		EDITOR: "true",
		GIT_ASKPASS: "/bin/echo",
		GIT_CONFIG: configFile,
		GIT_CONFIG_COUNT: "0",
		GIT_CONFIG_GLOBAL: globalConfig,
		GIT_CONFIG_SYSTEM: systemConfig,
		GIT_EDITOR: "true",
		GIT_EXEC_PATH: execSync("git --exec-path", { encoding: "utf8" }).trim(),
		GIT_EXTERNAL_DIFF: "true",
		GIT_PAGER: "cat",
		GIT_PROXY_COMMAND: "true",
		GIT_SEQUENCE_EDITOR: "true",
		GIT_SSH: "ssh",
		GIT_SSH_COMMAND: "ssh",
		GIT_TEMPLATE_DIR: templateDir,
		PAGER: "cat",
		PREFIX: workRoot,
		SSH_ASKPASS: "/bin/echo",
	};
}

async function expectUnsafeEnvRejected(git: SimpleGit): Promise<void> {
	try {
		await git.raw(["status", "--short"]);
	} catch (err) {
		expect(String(err)).toContain("not permitted without enabling allowUnsafe");
		return;
	}

	throw new Error("Expected simple-git to reject unsafe git environment");
}

describe("simple-git user env options", () => {
	let workRoot: string;

	beforeEach(() => {
		workRoot = mkdtempSync(join(tmpdir(), "rox-git-client-"));
	});

	afterEach(() => {
		rmSync(workRoot, { recursive: true, force: true });
	});

	test("enables every simple-git unsafe compatibility flag", () => {
		for (const flag of SIMPLE_GIT_UNSAFE_OPTION_FLAGS) {
			expect(USER_GIT_ENV_SIMPLE_GIT_OPTIONS.unsafe[flag]).toBe(true);
		}
	});

	test("rejects the same env without the unsafe allow-list", async () => {
		const repoPath = join(workRoot, "repo");
		mkdirSync(repoPath);
		execSync("git init", { cwd: repoPath, stdio: "ignore" });

		await expectUnsafeEnvRejected(
			simpleGit(repoPath).env(makeBlockedGitEnv(workRoot)),
		);
	});

	test("allows user git env variables that simple-git blocks by default", async () => {
		const repoPath = join(workRoot, "repo");
		mkdirSync(repoPath);
		execSync("git init", { cwd: repoPath, stdio: "ignore" });

		const git = simpleGit(repoPath, USER_GIT_ENV_SIMPLE_GIT_OPTIONS).env(
			makeBlockedGitEnv(workRoot),
		);

		const status = await git.raw(["status", "--short"]);
		expect(status).toBe("");
	});
});

describe("git binary resolution (Ф2 #507)", () => {
	beforeEach(() => {
		resetGitBinaryResolutionCache();
	});

	afterEach(() => {
		resetGitBinaryResolutionCache();
	});

	test("resolves to the system git when git is on PATH", async () => {
		// The test runner always has git on PATH (it shells out to it above), so
		// the resolver must prefer system git — not the bundled fallback.
		const resolution = await resolveGitBinary();
		expect(resolution.source).toBe("system");
		expect(resolution.binary).toBe("git");
		// Longer timeout: the first resolution derives the login-shell PATH, which
		// can take several seconds on a cold shell (heavy login profiles).
	}, 30000);

	test("caches the resolution across calls", async () => {
		const first = await resolveGitBinary();
		const second = await resolveGitBinary();
		expect(second).toBe(first);
	}, 30000);

	test("the resolved binary runs git --version end to end", async () => {
		const { stdout } = await execGitWithShellPath(["--version"]);
		expect(stdout).toContain("git version");
	}, 30000);
});
