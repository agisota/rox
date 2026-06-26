import { beforeEach, describe, expect, it, mock } from "bun:test";
import { buildStarterPrompts, EMPTY_STATE_SURFACES } from "./suggest";

// --- DB / membership stubs ---------------------------------------------------
// `forSurface` only calls `requireActiveOrgMembership`, which delegates to
// `verifyOrgMembership` and never touches the suggestion copy. Stub it so the
// suite needs no live database (mirrors the profile-capabilities suite).
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));
mock.module("@rox/db/client", () => ({ db: {} }));

const { suggestionsRouter } = await import("./suggestions");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ suggestions: suggestionsRouter });
const createCaller = createCallerFactory(appRouter);

function callerFor(activeOrganizationId: string | null) {
	return createCaller({
		session: {
			user: { id: "user-1", email: "dev@rox.one" },
			session: { activeOrganizationId },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test context.
	} as any);
}

beforeEach(() => {});

describe("buildStarterPrompts (pure core)", () => {
	it("returns 3–4 starters for every surface", () => {
		for (const surface of EMPTY_STATE_SURFACES) {
			const prompts = buildStarterPrompts({ surface });
			expect(prompts.length).toBeGreaterThanOrEqual(3);
			expect(prompts.length).toBeLessThanOrEqual(4);
			// Stable, unique ids so chips key cleanly.
			const ids = new Set(prompts.map((p) => p.id));
			expect(ids.size).toBe(prompts.length);
			for (const p of prompts) {
				expect(p.label.length).toBeGreaterThan(0);
				expect(p.prompt.length).toBeGreaterThan(0);
			}
		}
	});

	it("tints chat copy with the active persona + workspace", () => {
		const prompts = buildStarterPrompts({
			surface: "chat",
			personaName: "Researcher",
			workspaceName: "rox-web",
		});
		const summarize = prompts.find((p) => p.id === "chat-summarize");
		expect(summarize?.label).toContain("Researcher");
		expect(summarize?.label).toContain("rox-web");
		expect(summarize?.prompt).toContain("rox-web");
	});

	it("falls back to generic copy when no context is given", () => {
		const prompts = buildStarterPrompts({ surface: "chat" });
		const summarize = prompts.find((p) => p.id === "chat-summarize");
		expect(summarize?.label).not.toContain("«");
	});

	it("keeps drive/tab action chips as dispatch tokens", () => {
		const drive = buildStarterPrompts({ surface: "drive" });
		expect(drive.find((p) => p.id === "drive-upload")?.prompt).toBe("upload");
		const tab = buildStarterPrompts({ surface: "tab" });
		expect(tab.find((p) => p.id === "tab-chat")?.prompt).toBe("new-chat");
	});
});

describe("suggestions.forSurface", () => {
	it("returns starters for a member of the active org", async () => {
		const caller = callerFor("org-1");
		const res = await caller.suggestions.forSurface({ surface: "chat" });
		expect(res.length).toBeGreaterThanOrEqual(3);
	});

	it("rejects when no active org is selected", async () => {
		const caller = callerFor(null);
		await expect(
			caller.suggestions.forSurface({ surface: "drive" }),
		).rejects.toThrow();
	});
});
