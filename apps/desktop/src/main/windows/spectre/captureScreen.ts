export interface CaptureDeps {
	getMediaAccessStatus: (
		mediaType: "screen",
	) => "not-determined" | "granted" | "denied" | "restricted" | "unknown";
	getSources: (opts: {
		types: Array<"screen" | "window">;
		thumbnailSize: { width: number; height: number };
	}) => Promise<
		Array<{ thumbnail: { toPNG: () => Buffer; isEmpty: () => boolean } }>
	>;
}

export interface CaptureResult {
	granted: boolean;
	pngBase64: string | null;
}

/**
 * Capture the primary screen as a base64 PNG for Spectre's vision queries.
 *
 * macOS requires the "Screen Recording" permission; when it isn't granted we
 * return `granted:false` instead of a black frame so the overlay can prompt the
 * user to enable it rather than silently sending an empty image to grok-4.3.
 * Side-effect-free over injected Electron deps so it is unit-testable.
 */
export async function capturePrimaryScreenPng(
	deps: CaptureDeps,
): Promise<CaptureResult> {
	const status = deps.getMediaAccessStatus("screen");
	if (
		status !== "granted" &&
		status !== "not-determined" &&
		status !== "unknown"
	) {
		return { granted: false, pngBase64: null };
	}
	const sources = await deps.getSources({
		types: ["screen"],
		thumbnailSize: { width: 1920, height: 1080 },
	});
	const first = sources[0];
	if (!first || first.thumbnail.isEmpty()) {
		return { granted: false, pngBase64: null };
	}
	return {
		granted: true,
		pngBase64: first.thumbnail.toPNG().toString("base64"),
	};
}
