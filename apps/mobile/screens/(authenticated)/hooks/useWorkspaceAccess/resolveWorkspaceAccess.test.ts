import { describe, expect, test } from "bun:test";
import {
	canAccessWorkspace,
	resolveWorkspaceAccess,
} from "./resolveWorkspaceAccess";

describe("resolveWorkspaceAccess", () => {
	test("pending session with no user yet -> loading (not signedOut)", () => {
		expect(
			resolveWorkspaceAccess({
				userId: null,
				activeOrganizationId: null,
				isSessionPending: true,
			}),
		).toBe("loading");
	});

	test("settled session, no user -> signedOut", () => {
		expect(
			resolveWorkspaceAccess({
				userId: null,
				activeOrganizationId: null,
				isSessionPending: false,
			}),
		).toBe("signedOut");
	});

	test("signed in, no active org -> noOrg", () => {
		expect(
			resolveWorkspaceAccess({
				userId: "u1",
				activeOrganizationId: null,
			}),
		).toBe("noOrg");
	});

	test("org-list scope (no project) with active org -> ok", () => {
		expect(
			resolveWorkspaceAccess({
				userId: "u1",
				activeOrganizationId: "org-1",
			}),
		).toBe("ok");
	});

	test("project owned by active org -> ok", () => {
		expect(
			resolveWorkspaceAccess({
				userId: "u1",
				activeOrganizationId: "org-1",
				projectOrganizationId: "org-1",
				isProjectResolved: true,
			}),
		).toBe("ok");
	});

	test("project owned by a different org -> noAccess", () => {
		expect(
			resolveWorkspaceAccess({
				userId: "u1",
				activeOrganizationId: "org-1",
				projectOrganizationId: "org-2",
				isProjectResolved: true,
			}),
		).toBe("noAccess");
	});

	test("project not resolved yet -> loading (no false deny)", () => {
		expect(
			resolveWorkspaceAccess({
				userId: "u1",
				activeOrganizationId: "org-1",
				projectOrganizationId: undefined,
				isProjectResolved: false,
			}),
		).toBe("loading");
	});

	test("project resolved but missing (unknown id) -> noAccess", () => {
		expect(
			resolveWorkspaceAccess({
				userId: "u1",
				activeOrganizationId: "org-1",
				projectOrganizationId: undefined,
				isProjectResolved: true,
			}),
		).toBe("noAccess");
	});

	test("project resolved with blank org -> noAccess", () => {
		expect(
			resolveWorkspaceAccess({
				userId: "u1",
				activeOrganizationId: "org-1",
				projectOrganizationId: null,
				isProjectResolved: true,
			}),
		).toBe("noAccess");
	});
});

describe("canAccessWorkspace", () => {
	test("only ok grants access", () => {
		expect(canAccessWorkspace("ok")).toBe(true);
		for (const state of [
			"signedOut",
			"noOrg",
			"noAccess",
			"loading",
		] as const) {
			expect(canAccessWorkspace(state)).toBe(false);
		}
	});
});
