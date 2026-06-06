import { describe, expect, it } from "bun:test";
import { extractRepoName } from "./repo-url";

describe("extractRepoName", () => {
	it("extracts the repo name from https URLs (with and without .git)", () => {
		expect(extractRepoName("https://github.com/acme/my-repo.git")).toBe(
			"my-repo",
		);
		expect(extractRepoName("https://github.com/acme/my-repo")).toBe("my-repo");
	});

	it("extracts from SSH-style URLs", () => {
		expect(extractRepoName("git@github.com:acme/my-repo.git")).toBe("my-repo");
	});

	it("strips trailing slashes, query strings, and fragments", () => {
		expect(extractRepoName("https://github.com/acme/my-repo/")).toBe("my-repo");
		expect(extractRepoName("https://github.com/acme/my-repo?x=1#y")).toBe(
			"my-repo",
		);
	});

	it("decodes percent-encoding", () => {
		expect(extractRepoName("https://github.com/acme/my%20repo")).toBe(
			"my repo",
		);
	});

	it("returns null for empty input or unsafe names", () => {
		expect(extractRepoName("")).toBeNull();
		expect(extractRepoName("   ")).toBeNull();
		expect(extractRepoName("https://github.com/acme/bad$name")).toBeNull();
	});
});
