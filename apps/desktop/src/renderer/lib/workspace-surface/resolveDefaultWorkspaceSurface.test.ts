import { afterEach, describe, expect, it } from "bun:test";
import { useChatPreferencesStore } from "renderer/stores/chat-preferences";
import { resolveDefaultWorkspaceSurface } from "./resolveDefaultWorkspaceSurface";

describe("resolveDefaultWorkspaceSurface", () => {
	afterEach(() => {
		useChatPreferencesStore.setState({ defaultWorkspaceSurface: "chat" });
	});

	it("defaults to chat", () => {
		expect(resolveDefaultWorkspaceSurface()).toBe("chat");
	});

	it("honors a stored terminal preference", () => {
		useChatPreferencesStore.getState().setDefaultWorkspaceSurface("terminal");
		expect(resolveDefaultWorkspaceSurface()).toBe("terminal");
	});

	it("falls back to chat when the stored value is missing", () => {
		// Simulate a persisted store rehydrated without the new field.
		useChatPreferencesStore.setState({
			defaultWorkspaceSurface: undefined as never,
		});
		expect(resolveDefaultWorkspaceSurface()).toBe("chat");
	});
});
