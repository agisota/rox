import { describe, expect, it } from "bun:test";
import { getWebSearchViewModel } from "./getWebSearchViewModel";

describe("getWebSearchViewModel", () => {
	it("maps structured results array", () => {
		const viewModel = getWebSearchViewModel({
			args: { query: "rox" },
			result: {
				results: [
					{
						title: "Rox - Run 10+ parallel coding agents on your machine",
						url: "https://rox.one/",
						content: "snippet",
					},
				],
			},
		});

		expect(viewModel.query).toBe("rox");
		expect(viewModel.results).toEqual([
			{
				title: "Rox - Run 10+ parallel coding agents on your machine",
				url: "https://rox.one/",
			},
		]);
	});

	it("parses transcript-style text with headings and urls", () => {
		const viewModel = getWebSearchViewModel({
			args: { query: "rox.one terminal for coding agents" },
			result: {
				text: `Answer: summary

## rox/README.md at main - GitHub
https://github.com/agisota/set/blob/main/README.md
Description text

## Rox - Run 10+ parallel coding agents on your machine
https://rox.one/`,
			},
		});

		expect(viewModel.results).toEqual([
			{
				title: "rox/README.md at main - GitHub",
				url: "https://github.com/agisota/set/blob/main/README.md",
			},
			{
				title: "Rox - Run 10+ parallel coding agents on your machine",
				url: "https://rox.one/",
			},
		]);
	});

	it("reads nested text payloads and deduplicates urls", () => {
		const viewModel = getWebSearchViewModel({
			args: { query: "rox" },
			result: {
				result: {
					output: {
						text: `## Rox
https://rox.one/
https://rox.one/`,
					},
				},
			},
		});

		expect(viewModel.results).toEqual([
			{
				title: "Rox",
				url: "https://rox.one/",
			},
		]);
	});
});
