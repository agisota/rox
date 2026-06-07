import { describe, expect, test } from "bun:test";
import {
	buildPullRequestCompareUrl,
	normalizeGitHubRepoUrl,
	parseUpstreamRef,
} from "./pull-request-url";

describe("pull-request-url", () => {
	test("normalizes GitHub remote URLs", () => {
		expect(normalizeGitHubRepoUrl("https://github.com/agisota/set.git")).toBe(
			"https://github.com/agisota/set",
		);
		expect(normalizeGitHubRepoUrl("git@github.com:Kitenite/rox.git")).toBe(
			"https://github.com/Kitenite/rox",
		);
		expect(
			normalizeGitHubRepoUrl("ssh://git@github.com/Kitenite/rox.git"),
		).toBe("https://github.com/Kitenite/rox");
	});

	test("parses upstream refs with slashes in branch names", () => {
		expect(parseUpstreamRef("kitenite/kitenite/halved-position")).toEqual({
			remoteName: "kitenite",
			branchName: "kitenite/halved-position",
		});
	});

	test("builds compare URLs for fork branches", () => {
		expect(
			buildPullRequestCompareUrl({
				baseRepoUrl: "https://github.com/agisota/set.git",
				baseBranch: "main",
				headRepoOwner: "Kitenite",
				headBranch: "kitenite/halved-position",
			}),
		).toBe(
			"https://github.com/agisota/set/compare/main...Kitenite:kitenite/halved-position?expand=1",
		);
	});
});
