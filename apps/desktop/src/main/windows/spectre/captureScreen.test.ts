import { describe, expect, it, mock } from "bun:test";
import { type CaptureDeps, capturePrimaryScreenPng } from "./captureScreen";

describe("capturePrimaryScreenPng", () => {
	it("returns the base64 PNG of the first screen source when granted", async () => {
		const png = Buffer.from("fake-png");
		const deps: CaptureDeps = {
			getMediaAccessStatus: () => "granted",
			getSources: mock(async () => [
				{ thumbnail: { toPNG: () => png, isEmpty: () => false } },
			]),
		};
		const result = await capturePrimaryScreenPng(deps);
		expect(result.granted).toBe(true);
		expect(result.pngBase64).toBe(png.toString("base64"));
	});

	it("reports denied permission without calling getSources or throwing", async () => {
		const getSources = mock(async () => []);
		const deps: CaptureDeps = {
			getMediaAccessStatus: () => "denied",
			getSources,
		};
		const result = await capturePrimaryScreenPng(deps);
		expect(result.granted).toBe(false);
		expect(result.pngBase64).toBeNull();
		expect(getSources).not.toHaveBeenCalled();
	});

	it("treats an empty thumbnail as not captured", async () => {
		const deps: CaptureDeps = {
			getMediaAccessStatus: () => "granted",
			getSources: async () => [
				{ thumbnail: { toPNG: () => Buffer.from(""), isEmpty: () => true } },
			],
		};
		const result = await capturePrimaryScreenPng(deps);
		expect(result.granted).toBe(false);
		expect(result.pngBase64).toBeNull();
	});
});
