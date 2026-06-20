import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import {
	commitInitialWithIdentityFallback,
	isMissingGitIdentityError,
} from "./initial-commit";

/**
 * Integration tests against real on-disk git repos for the desktop
 * git-init initial-commit path. The point is the auto-identity fallback:
 * a freshly-onboarded non-developer with no global git identity must still
 * land a first commit instead of dead-ending on git's "empty ident" error.
 */

let workRoot: string;

beforeEach(() => {
	workRoot = mkdtempSync(join(tmpdir(), "rox-initial-commit-"));
});

afterEach(() => {
	rmSync(workRoot, { recursive: true, force: true });
});

async function initRepo(path: string) {
	mkdirSync(path, { recursive: true });
	const git = simpleGit(path);
	await git.init(["--initial-branch=main"]);
	return git;
}

async function commitCount(path: string): Promise<number> {
	const out = await simpleGit(path).raw(["rev-list", "--count", "HEAD"]);
	return Number(out.trim());
}

describe("isMissingGitIdentityError", () => {
	test("matches git's empty-ident / user.email / user.name messages", () => {
		expect(isMissingGitIdentityError(new Error("empty ident name"))).toBe(true);
		expect(
			isMissingGitIdentityError(
				new Error("please tell me who you are user.email"),
			),
		).toBe(true);
		expect(isMissingGitIdentityError(new Error("config user.name"))).toBe(true);
	});

	test("does not match unrelated failures", () => {
		expect(isMissingGitIdentityError(new Error("permission denied"))).toBe(
			false,
		);
		expect(isMissingGitIdentityError("nothing relevant")).toBe(false);
	});
});

describe("commitInitialWithIdentityFallback", () => {
	test("commits normally when a git identity is configured", async () => {
		const repo = join(workRoot, "with-identity");
		const git = await initRepo(repo);
		await git.raw(["config", "user.name", "Dev Person"]);
		await git.raw(["config", "user.email", "dev@example.com"]);
		await git.raw(["config", "commit.gpgsign", "false"]);

		await commitInitialWithIdentityFallback(git);

		expect(await commitCount(repo)).toBe(1);
		const committer = (
			await simpleGit(repo).raw(["log", "-1", "--format=%cn <%ce>"])
		).trim();
		expect(committer).toBe("Dev Person <dev@example.com>");
	});

	test("seeds the Rox fallback identity when git refuses to auto-derive one", async () => {
		// `user.useConfigOnly = true` makes git refuse to guess an identity from
		// username/hostname, reproducing the "empty ident" failure a freshly
		// onboarded user with no git identity hits. The commit-scoped fallback
		// must rescue the commit — and must NOT leak into global config.
		const cfgHome = join(workRoot, "config-only-home");
		mkdirSync(cfgHome);
		const globalCfg = join(cfgHome, ".gitconfig");
		writeFileSync(globalCfg, "[user]\n\tuseConfigOnly = true\n");

		const saved: Record<string, string | undefined> = {};
		const overrides: Record<string, string | undefined> = {
			HOME: cfgHome,
			XDG_CONFIG_HOME: cfgHome,
			GIT_CONFIG_GLOBAL: globalCfg,
			GIT_CONFIG_SYSTEM: "/dev/null",
			GIT_AUTHOR_NAME: undefined,
			GIT_AUTHOR_EMAIL: undefined,
			GIT_COMMITTER_NAME: undefined,
			GIT_COMMITTER_EMAIL: undefined,
		};
		for (const key of Object.keys(overrides)) {
			saved[key] = process.env[key];
			const value = overrides[key];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}

		try {
			const repo = join(workRoot, "no-identity");
			const git = await initRepo(repo);

			await commitInitialWithIdentityFallback(git);

			expect(await commitCount(repo)).toBe(1);
			const committer = (
				await simpleGit(repo).raw(["log", "-1", "--format=%cn <%ce>"])
			).trim();
			expect(committer).toBe("Rox <rox@localhost>");
			// The fallback must be commit-scoped, never written to global config.
			expect(readFileSync(globalCfg, "utf8")).not.toContain("rox@localhost");
		} finally {
			for (const key of Object.keys(saved)) {
				const value = saved[key];
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		}
	});

	test("rethrows a friendly error for non-identity commit failures", async () => {
		const repo = join(workRoot, "broken");
		const git = await initRepo(repo);
		await git.raw(["config", "user.name", "Dev Person"]);
		await git.raw(["config", "user.email", "dev@example.com"]);
		// Land the initial commit, then a second call with --allow-empty would
		// still succeed, so force a real non-identity failure by committing in a
		// path that is not a repo.
		const notRepo = join(workRoot, "not-a-repo");
		mkdirSync(notRepo);

		await expect(
			commitInitialWithIdentityFallback(simpleGit(notRepo)),
		).rejects.toThrow(/Failed to create initial commit/);
	});
});
