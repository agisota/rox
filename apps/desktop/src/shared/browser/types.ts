/**
 * Shared data contracts for the Browser pane Design Mode + Mobile View features.
 *
 * These types are pure (no Electron imports) so they can be consumed from the
 * main process, the renderer, and unit tests alike. They mirror the integration
 * spec's §6 data contracts.
 */

export type DevicePresetId =
	| "responsive"
	| "iphone-se"
	| "iphone-15"
	| "pixel-8"
	| "custom"
	| (string & {});

export type DevicePreset = {
	id: DevicePresetId;
	label: string;
	width: number;
	height: number;
	deviceScaleFactor: number;
	isMobile: boolean;
	hasTouch: boolean;
	userAgent?: string;
};

export type CaptureBounds = {
	x: number;
	y: number;
	width: number;
	height: number;
	viewportWidth: number;
	viewportHeight: number;
	deviceScaleFactor: number;
};

export type CaptureSelector = {
	css?: string;
	xpath?: string;
	textSnippet?: string;
	role?: string;
	testId?: string;
};

export type CaptureSource = {
	filePath: string;
	line?: number;
	column?: number;
	framework?: "react" | "vue" | "svelte" | "unknown";
	confidence: "high" | "medium" | "low";
};

export type CaptureScreenshot = {
	/** Workspace-scoped temp path the PNG/WebP was written to. */
	path: string;
	/** Base64-encoded image data for direct attachment to the agent. */
	data: string;
	mimeType: "image/png" | "image/webp";
	width: number;
	height: number;
};

export type DesignModeCapture = {
	id: string;
	workspaceId: string;
	browserSessionId: string;
	url: string;
	title?: string;
	timestamp: string;
	selector: CaptureSelector;
	bounds: CaptureBounds;
	html: {
		outerHTML: string;
		parentContextHTML?: string;
		nearbyText?: string;
	};
	styles: {
		computed: Record<string, string>;
		matchedRules?: Array<{
			selector: string;
			cssText: string;
			sourceUrl?: string;
			line?: number;
			column?: number;
		}>;
	};
	screenshot: CaptureScreenshot;
	source?: CaptureSource;
	devicePresetId: DevicePresetId;
};

/**
 * Raw, untrusted descriptor produced by the in-page serialization script and
 * handed to the main process. Everything here originates in the guest page, so it
 * is normalized/filtered/size-limited before becoming a {@link DesignModeCapture}.
 */
export type RawElementDescriptor = {
	tagName: string;
	id?: string;
	classList: string[];
	attributes: Record<string, string>;
	testId?: string;
	role?: string;
	ariaLabel?: string;
	outerHTML: string;
	parentOuterHTML?: string;
	nearbyText?: string;
	textSnippet?: string;
	computedStyles: Record<string, string>;
	rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	viewport: {
		width: number;
		height: number;
		devicePixelRatio: number;
	};
	/** DOM ancestry indices used to synthesize an XPath, root-last. */
	domPath: Array<{ tagName: string; index: number }>;
	/** Best-effort source hints surfaced by dev tooling (e.g. data-source attrs). */
	sourceHint?: {
		filePath?: string;
		line?: number;
		column?: number;
		framework?: "react" | "vue" | "svelte" | "unknown";
	};
};

export type DesignModeEvent =
	| { type: "enabled" }
	| { type: "disabled" }
	| { type: "hover"; tagName: string }
	| { type: "selected"; clientPoint: { x: number; y: number } }
	| { type: "error"; message: string };
