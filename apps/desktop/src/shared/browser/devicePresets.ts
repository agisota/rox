import type { DevicePreset, DevicePresetId } from "./types";

const IOS_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

/**
 * Built-in device presets. `responsive` disables emulation (uses the pane's own
 * size); the mobile presets drive {@link DevicePreset.isMobile}/`hasTouch` so the
 * webview applies CDP device emulation + touch.
 */
export const DEVICE_PRESETS: readonly DevicePreset[] = Object.freeze([
	{
		id: "responsive",
		label: "Responsive",
		width: 0,
		height: 0,
		deviceScaleFactor: 0,
		isMobile: false,
		hasTouch: false,
	},
	{
		id: "iphone-se",
		label: "iPhone SE",
		width: 375,
		height: 667,
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true,
		userAgent: IOS_UA,
	},
	{
		id: "iphone-15",
		label: "iPhone 15",
		width: 393,
		height: 852,
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
		userAgent: IOS_UA,
	},
	{
		id: "pixel-8",
		label: "Pixel 8",
		width: 412,
		height: 915,
		deviceScaleFactor: 2.625,
		isMobile: true,
		hasTouch: true,
		userAgent: ANDROID_UA,
	},
]);

export const DEFAULT_DEVICE_PRESET_ID: DevicePresetId = "responsive";

export function getDevicePreset(id: DevicePresetId): DevicePreset | undefined {
	return DEVICE_PRESETS.find((p) => p.id === id);
}

/**
 * Resolves a preset, falling back to `responsive` for unknown ids so callers
 * never crash on stale persisted state.
 */
export function resolveDevicePreset(id: string | undefined): DevicePreset {
	const found = id ? getDevicePreset(id) : undefined;
	return found ?? (getDevicePreset(DEFAULT_DEVICE_PRESET_ID) as DevicePreset);
}

/**
 * Builds a `custom` preset from explicit dimensions. Width/height are clamped to
 * a sane range so a malformed value can't blow up device emulation.
 */
export function createCustomPreset(input: {
	width: number;
	height: number;
	deviceScaleFactor?: number;
	isMobile?: boolean;
	hasTouch?: boolean;
	userAgent?: string;
}): DevicePreset {
	const clamp = (v: number, lo: number, hi: number) =>
		Math.min(hi, Math.max(lo, Math.round(v)));
	return {
		id: "custom",
		label: "Custom",
		width: clamp(input.width, 240, 4096),
		height: clamp(input.height, 240, 4096),
		deviceScaleFactor: Math.min(4, Math.max(1, input.deviceScaleFactor ?? 1)),
		isMobile: input.isMobile ?? true,
		hasTouch: input.hasTouch ?? true,
		userAgent: input.userAgent,
	};
}

export function isEmulatedPreset(preset: DevicePreset): boolean {
	return preset.id !== "responsive" && preset.width > 0 && preset.height > 0;
}
