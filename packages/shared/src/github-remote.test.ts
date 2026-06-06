import { describe, expect, it } from "bun:test";
import { githubAvatarUrl, parseGitHubRemote } from "./github-remote";

describe("githubAvatarUrl", () => {
	it("builds the base avatar URL without a size", () => {
		expect(githubAvatarUrl("octocat")).toBe("https://github.com/octocat.png");
	});

	it("appends ?size= when a size is given", () => {
		expect(githubAvatarUrl("octocat", 64)).toBe(
			"https://github.com/octocat.png?size=64",
		);
	});

	it("url-encodes the owner", () => {
		expect(githubAvatarUrl("a b")).toBe("https://github.com/a%20b.png");
	});
});

describe("parseGitHubRemote", () => {
	it("parses https remotes", () => {
		expect(parseGitHubRemote("https://github.com/acme/repo.git")).toMatchObject(
			{ owner: "acme", name: "repo" },
		);
	});

	it("parses ssh remotes", () => {
		expect(parseGitHubRemote("git@github.com:acme/repo.git")).toMatchObject({
			owner: "acme",
			name: "repo",
		});
	});

	it("returns null for non-github remotes", () => {
		expect(parseGitHubRemote("https://gitlab.com/a/b.git")).toBeNull();
	});
});
