import { beforeEach, describe, expect, it } from "bun:test";
import { useGithubConnectBannerStore } from "./store";

describe("github connect banner store", () => {
	beforeEach(() => {
		useGithubConnectBannerStore.setState({ neverShow: false });
	});

	it("defaults to showing the banner (neverShow false)", () => {
		expect(useGithubConnectBannerStore.getState().neverShow).toBe(false);
	});

	it("persists the permanent opt-out via setNeverShow", () => {
		useGithubConnectBannerStore.getState().setNeverShow(true);
		expect(useGithubConnectBannerStore.getState().neverShow).toBe(true);

		useGithubConnectBannerStore.getState().setNeverShow(false);
		expect(useGithubConnectBannerStore.getState().neverShow).toBe(false);
	});
});
