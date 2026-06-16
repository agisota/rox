import { describe, expect, it } from "bun:test";
import {
	findActiveArtifactShare,
	getArtifactDisplayTitle,
	sortArtifactsByNewest,
} from "./share-artifacts";

describe("share artifact display helpers", () => {
	it("uses trimmed artifact titles and falls back to a stable id label", () => {
		expect(
			getArtifactDisplayTitle({
				id: "12345678-aaaa-bbbb-cccc-123456789abc",
				title: " Release notes ",
			}),
		).toBe("Release notes");

		expect(
			getArtifactDisplayTitle({
				id: "abcdef12-aaaa-bbbb-cccc-123456789abc",
				title: "   ",
			}),
		).toBe("Artifact abcdef12");
	});

	it("sorts artifact rows newest first without mutating input", () => {
		const older = {
			id: "older",
			title: "Older",
			createdAt: "2026-06-15T10:00:00.000Z",
		};
		const newer = {
			id: "newer",
			title: "Newer",
			createdAt: "2026-06-15T11:00:00.000Z",
		};
		const input = [older, newer];

		expect(sortArtifactsByNewest(input)).toEqual([newer, older]);
		expect(input).toEqual([older, newer]);
	});

	it("finds active public shares for an artifact and ignores revoked links", () => {
		const active = {
			resourceType: "artifact",
			resourceId: "artifact-1",
			revokedAt: null,
			url: "https://app.rox.one/s/active",
		};

		expect(
			findActiveArtifactShare(
				[
					{
						resourceType: "artifact",
						resourceId: "artifact-1",
						revokedAt: "2026-06-15T10:00:00.000Z",
						url: "https://app.rox.one/s/revoked",
					},
					active,
					{
						resourceType: "chat_session",
						resourceId: "artifact-1",
						url: "https://app.rox.one/s/chat",
					},
				],
				"artifact-1",
			),
		).toBe(active);
	});
});
