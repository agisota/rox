import type { CaptureBounds, RawElementDescriptor } from "./types";

export const DEFAULT_CAPTURE_PADDING = 12; // px, within the spec's 8–16 range

export type CropRect = { x: number; y: number; width: number; height: number };

/**
 * Computes an integer, padded crop rectangle in CSS pixels, clamped to the
 * viewport. Electron's `WebContents.capturePage(rect)` takes CSS-pixel
 * coordinates relative to the view, so this stays in CSS px; the resulting image
 * is upscaled by the device pixel ratio (see {@link expectedImagePixelSize}).
 */
export function computeCropRect(
	rect: { x: number; y: number; width: number; height: number },
	viewport: { width: number; height: number },
	padding: number = DEFAULT_CAPTURE_PADDING,
): CropRect {
	const left = Math.max(0, Math.floor(rect.x - padding));
	const top = Math.max(0, Math.floor(rect.y - padding));
	const right = Math.min(
		viewport.width,
		Math.ceil(rect.x + rect.width + padding),
	);
	const bottom = Math.min(
		viewport.height,
		Math.ceil(rect.y + rect.height + padding),
	);
	return {
		x: left,
		y: top,
		width: Math.max(1, right - left),
		height: Math.max(1, bottom - top),
	};
}

/** Physical pixel dimensions of the captured image for a CSS-px crop. */
export function expectedImagePixelSize(
	crop: CropRect,
	devicePixelRatio: number,
): { width: number; height: number } {
	const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
	return {
		width: Math.round(crop.width * dpr),
		height: Math.round(crop.height * dpr),
	};
}

/** Builds the {@link CaptureBounds} contract from a serialized descriptor. */
export function toCaptureBounds(desc: RawElementDescriptor): CaptureBounds {
	return {
		x: desc.rect.x,
		y: desc.rect.y,
		width: desc.rect.width,
		height: desc.rect.height,
		viewportWidth: desc.viewport.width,
		viewportHeight: desc.viewport.height,
		deviceScaleFactor: desc.viewport.devicePixelRatio,
	};
}
