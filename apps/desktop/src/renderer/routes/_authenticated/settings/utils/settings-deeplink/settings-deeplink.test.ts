import { beforeEach, describe, expect, it } from "bun:test";
import { SETTING_ITEM_ID } from "../settings-search";
import {
	requestSettingsDeepLink,
	settingItemAnchorId,
	useSettingsDeepLinkStore,
} from "./settings-deeplink";

describe("settings-deeplink", () => {
	beforeEach(() => {
		useSettingsDeepLinkStore.getState().clearDeepLink();
	});

	it("builds a stable anchor id from a setting item id", () => {
		expect(settingItemAnchorId(SETTING_ITEM_ID.APPEARANCE_GLASS)).toBe(
			"setting-item-appearance-glass",
		);
	});

	it("records a requested deep-link target", () => {
		requestSettingsDeepLink(SETTING_ITEM_ID.APPEARANCE_GLASS);
		expect(useSettingsDeepLinkStore.getState().pendingItemId).toBe(
			SETTING_ITEM_ID.APPEARANCE_GLASS,
		);
	});

	it("consumes the target once when ids match", () => {
		requestSettingsDeepLink(SETTING_ITEM_ID.APPEARANCE_GLASS);
		const store = useSettingsDeepLinkStore.getState();
		expect(store.consumeDeepLink(SETTING_ITEM_ID.APPEARANCE_GLASS)).toBe(true);
		expect(useSettingsDeepLinkStore.getState().pendingItemId).toBeNull();
		// Second consume is a no-op.
		expect(
			useSettingsDeepLinkStore
				.getState()
				.consumeDeepLink(SETTING_ITEM_ID.APPEARANCE_GLASS),
		).toBe(false);
	});

	it("does not consume a non-matching target", () => {
		requestSettingsDeepLink(SETTING_ITEM_ID.APPEARANCE_GLASS);
		expect(
			useSettingsDeepLinkStore
				.getState()
				.consumeDeepLink(SETTING_ITEM_ID.APPEARANCE_THEME),
		).toBe(false);
		expect(useSettingsDeepLinkStore.getState().pendingItemId).toBe(
			SETTING_ITEM_ID.APPEARANCE_GLASS,
		);
	});
});
