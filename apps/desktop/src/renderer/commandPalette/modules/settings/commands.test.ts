import { describe, expect, it, mock } from "bun:test";
import { getPathFromSection } from "renderer/routes/_authenticated/settings/components/SettingsSidebar/settings-manifest";
import { useSettingsDeepLinkStore } from "renderer/routes/_authenticated/settings/utils/settings-deeplink";
import { SETTINGS_ITEMS } from "renderer/routes/_authenticated/settings/utils/settings-search";
import type { CommandContext } from "../../core/types";
import { settingsItemCommands, settingsItemsProvider } from "./commands";

function createContext(): CommandContext {
	return {
		route: { pathname: "/workspace", params: {} },
		workspace: null,
		activeHostUrl: null,
		activeOrganizationId: null,
		activeOrganizationName: null,
		hostServiceStatus: "running",
		localMachineId: null,
		notificationSoundsMuted: false,
		navigate: mock(),
	};
}

describe("settingsItemsProvider", () => {
	it("exposes one deep-link command per registry item", () => {
		const commands = settingsItemsProvider.provide(createContext());
		expect(commands.length).toBe(SETTINGS_ITEMS.length);
		for (const item of SETTINGS_ITEMS) {
			const command = commands.find((c) => c.id === `settings.item.${item.id}`);
			expect(command).toBeDefined();
			expect(command?.title).toBe(`Открыть настройку: ${item.title}`);
		}
	});

	it("includes each item's RU/EN keywords for fuzzy matching", () => {
		const glass = SETTINGS_ITEMS.find((item) => item.title === "Остекление");
		expect(glass).toBeDefined();
		const command = settingsItemCommands.find(
			(c) => c.id === `settings.item.${glass?.id}`,
		);
		expect(command?.keywords).toContain("остекление");
	});

	it("records the deep-link target and navigates to the owning section", () => {
		useSettingsDeepLinkStore.getState().clearDeepLink();
		const glass = SETTINGS_ITEMS.find((item) => item.title === "Остекление");
		const command = settingsItemCommands.find(
			(c) => c.id === `settings.item.${glass?.id}`,
		);
		expect(command).toBeDefined();

		const ctx = createContext();
		command?.run?.(ctx);

		expect(useSettingsDeepLinkStore.getState().pendingItemId).toBe(
			glass?.id ?? null,
		);
		expect(ctx.navigate).toHaveBeenCalledWith(
			getPathFromSection(glass?.section ?? "appearance"),
		);
	});
});
