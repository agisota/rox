import { afterEach, describe, expect, test } from "bun:test";
import { ROX_CHAT_MODEL_ID } from "@rox/shared/chat-models";
import {
	deriveSessionTitle,
	generateLabelsFromTranscript,
	runQuickChatCompletion,
} from "./chat-completion";

describe("deriveSessionTitle", () => {
	test("uses the first trimmed line", () => {
		expect(deriveSessionTitle("  Привет, как дела?  ")).toBe(
			"Привет, как дела?",
		);
	});

	test("takes only the first line of a multi-line message", () => {
		expect(deriveSessionTitle("Заголовок\nтело сообщения")).toBe("Заголовок");
	});

	test("caps long titles to 80 chars with an ellipsis", () => {
		const title = deriveSessionTitle("я".repeat(200));
		expect(title.length).toBe(80);
		expect(title.endsWith("…")).toBe(true);
	});

	test("falls back to a RU default for an empty message", () => {
		expect(deriveSessionTitle("   ")).toBe("Быстрый чат");
	});
});

describe("runQuickChatCompletion model resolution", () => {
	const messages = [{ role: "user" as const, content: "привет" }];
	// Model resolution reads ROX_AI_API_KEY from the trpc env (process.env). When a
	// key is present in the shell, the house-model path would issue a real network
	// call, so the "not-configured" assertion only runs when no key is set.
	const hasServerKey = !!process.env.ROX_AI_API_KEY?.trim();

	test.skipIf(hasServerKey)(
		"returns not-configured for ROX R1 when no server key is set",
		async () => {
			const result = await runQuickChatCompletion({
				modelId: ROX_CHAT_MODEL_ID,
				messages,
				envSource: {},
			});
			expect(result.status).toBe("not-configured");
		},
	);

	test("returns needs-user-key for a non-Rox model", async () => {
		const result = await runQuickChatCompletion({
			modelId: "anthropic/claude-opus-4-8",
			messages,
			envSource: {},
		});
		// Non-Rox ids never reach the gateway on this server path, so this is a pure
		// (network-free) resolution regardless of whether a Rox key is configured.
		expect(result.status).toBe("needs-user-key");
	});

	test.skipIf(hasServerKey)(
		"recognises the house model under any accepted spelling",
		async () => {
			for (const spelling of ["rox-r1", "r1", "compound", "ROX R1"]) {
				const result = await runQuickChatCompletion({
					modelId: spelling,
					messages,
					envSource: {},
				});
				// Any house-model spelling resolves to the Rox path (not needs-user-key).
				expect(result.status).toBe("not-configured");
			}
		},
	);
});

describe("generateLabelsFromTranscript (F14 AI auto-tags)", () => {
	const originalFetch = globalThis.fetch;
	const originalKey = process.env.ROX_AI_API_KEY;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (originalKey === undefined) {
			delete process.env.ROX_AI_API_KEY;
		} else {
			process.env.ROX_AI_API_KEY = originalKey;
		}
	});

	test("returns [] for an empty transcript without calling the gateway", async () => {
		let called = false;
		globalThis.fetch = (async () => {
			called = true;
			return new Response("{}", { status: 200 });
		}) as typeof fetch;

		const labels = await generateLabelsFromTranscript({
			turns: [{ role: "user", content: "   " }],
		});
		expect(labels).toEqual([]);
		expect(called).toBe(false);
	});

	test("parses ≤3 normalized labels from the model reply", async () => {
		process.env.ROX_AI_API_KEY = "test-key";
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					choices: [
						{ message: { content: "Billing, Onboarding, Bug, Design" } },
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			)) as typeof fetch;

		const labels = await generateLabelsFromTranscript({
			turns: [{ role: "user", content: "Как настроить биллинг и онбординг?" }],
		});
		expect(labels).toEqual(["billing", "onboarding", "bug"]);
	});

	test("returns [] when no server key is configured (no per-user key path)", async () => {
		delete process.env.ROX_AI_API_KEY;
		let called = false;
		globalThis.fetch = (async () => {
			called = true;
			return new Response("{}", { status: 200 });
		}) as typeof fetch;

		const labels = await generateLabelsFromTranscript({
			turns: [{ role: "user", content: "тема разговора" }],
		});
		expect(labels).toEqual([]);
		expect(called).toBe(false);
	});
});
