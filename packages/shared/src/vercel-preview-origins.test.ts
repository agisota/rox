import { describe, expect, it } from "bun:test";

import { getTrustedVercelPreviewOrigins } from "./vercel-preview-origins";

describe("getTrustedVercelPreviewOrigins", () => {
	it("returns sibling preview origins for API preview deployments", () => {
		expect(
			getTrustedVercelPreviewOrigins("https://api-pr-2837-rox.vercel.app"),
		).toEqual([
			"https://web-pr-2837-rox.vercel.app",
			"https://admin-pr-2837-rox.vercel.app",
			"https://marketing-pr-2837-rox.vercel.app",
		]);
	});

	it("returns sibling preview origins for branch preview deployments", () => {
		expect(
			getTrustedVercelPreviewOrigins(
				"https://api-git-add-security-headers-rox.vercel.app",
			),
		).toEqual([
			"https://web-git-add-security-headers-rox.vercel.app",
			"https://admin-git-add-security-headers-rox.vercel.app",
			"https://marketing-git-add-security-headers-rox.vercel.app",
		]);
	});

	it("ignores non-vercel origins", () => {
		expect(getTrustedVercelPreviewOrigins("https://api.rox.one")).toEqual([]);
		expect(getTrustedVercelPreviewOrigins("http://localhost:3001")).toEqual([]);
	});
});
