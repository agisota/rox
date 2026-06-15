import { describe, expect, it } from "bun:test";
import { deriveModelProviderStatus } from "./provider-status";

describe("deriveModelProviderStatus", () => {
	it("marks an authenticated provider without issues as connected", () => {
		const status = deriveModelProviderStatus({
			providerId: "openai",
			authStatus: {
				authenticated: true,
				method: "oauth",
				source: "managed",
				issue: null,
			},
		});

		expect(status.connectionState).toBe("connected");
		expect(status.issue).toBeNull();
		expect(status.capabilities).toEqual({
			canUseChat: true,
			canGenerateWorkspaceTitle: true,
			canUseSmallModelTasks: true,
		});
	});

	it("treats expired auth as needs attention and disables all capabilities", () => {
		const status = deriveModelProviderStatus({
			providerId: "anthropic",
			authStatus: {
				authenticated: false,
				method: "oauth",
				source: "external",
				issue: "expired",
			},
		});

		expect(status.connectionState).toBe("needs_attention");
		expect(status.issue?.code).toBe("expired");
		expect(status.capabilities).toEqual({
			canUseChat: false,
			canGenerateWorkspaceTitle: false,
			canUseSmallModelTasks: false,
		});
	});

	it("reports disconnected for providers with no source and no auth", () => {
		const status = deriveModelProviderStatus({
			providerId: "openai",
			authStatus: {
				authenticated: false,
				method: null,
				source: null,
				issue: null,
			},
		});

		expect(status.connectionState).toBe("disconnected");
		expect(status.issue).toBeNull();
		expect(status.capabilities.canUseChat).toBe(false);
	});

	it("supports built-in and API-key-only providers", () => {
		const rox = deriveModelProviderStatus({
			providerId: "rox",
			authStatus: {
				authenticated: true,
				method: "env",
				source: "managed",
				issue: null,
			},
		});
		const groq = deriveModelProviderStatus({
			providerId: "groq",
			authStatus: {
				authenticated: true,
				method: "api_key",
				source: "managed",
				issue: null,
			},
		});

		expect(rox.connectionState).toBe("connected");
		expect(groq.connectionState).toBe("connected");
		expect(groq.capabilities.canUseChat).toBe(true);
	});
});
