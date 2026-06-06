import { describe, expect, it } from "bun:test";
import { isRawPullRequest, parsePullRequests } from "./pull-requests";

describe("isRawPullRequest", () => {
	it("accepts a well-formed raw PR object", () => {
		expect(
			isRawPullRequest({
				number: 1,
				title: "x",
				url: "u",
				state: "OPEN",
				isDraft: false,
			}),
		).toBe(true);
	});

	it("rejects non-objects and entries with missing or wrong-typed fields", () => {
		expect(isRawPullRequest(null)).toBe(false);
		expect(isRawPullRequest("x")).toBe(false);
		expect(isRawPullRequest({ number: 1, title: "x" })).toBe(false);
		expect(
			isRawPullRequest({
				number: "1",
				title: "x",
				url: "u",
				state: "OPEN",
				isDraft: false,
			}),
		).toBe(false);
	});
});

describe("parsePullRequests", () => {
	it("returns [] for non-array input", () => {
		expect(parsePullRequests(null)).toEqual([]);
		expect(parsePullRequests({})).toEqual([]);
	});

	it("filters invalid entries and maps state (draft/open/lowercased)", () => {
		expect(
			parsePullRequests([
				{ number: 1, title: "Feat", url: "u1", state: "OPEN", isDraft: false },
				{ number: 2, title: "WIP", url: "u2", state: "OPEN", isDraft: true },
				{
					number: 3,
					title: "Done",
					url: "u3",
					state: "MERGED",
					isDraft: false,
				},
				{ bogus: true },
			]),
		).toEqual([
			{ prNumber: 1, title: "Feat", url: "u1", state: "open" },
			{ prNumber: 2, title: "WIP", url: "u2", state: "draft" },
			{ prNumber: 3, title: "Done", url: "u3", state: "merged" },
		]);
	});
});
