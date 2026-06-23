/**
 * Drive upload safety: MIME allow-list + async malware scan gate (D5).
 *
 * Abuse safety has two layers:
 *  1. {@link assertAllowedMediaType} — a coarse MIME allow-list enforced at
 *     `requestUpload`, before any presigned PUT is handed out. Blocks the obvious
 *     executable/script payloads from ever reaching the bucket.
 *  2. {@link scanObject} — the async scan run on `confirmUpload`. A file lands as
 *     `scanning` and only a `clean` verdict makes it downloadable/shareable; a
 *     `quarantined` file is undownloadable and unshareable. The engine here is a
 *     stub that always returns `clean`, but the GATE it feeds (status checks in
 *     `requestDownload` / `resolveShare`) is real — swapping in a real scanner
 *     (ClamAV/VirusTotal) is a drop-in change to {@link scanObject}.
 */

import type { DriveScanResult } from "@rox/db/schema";

/**
 * MIME types that are never accepted for upload. Coarse but effective against
 * the common active-content payloads; the allow-list is "everything except
 * these" so legitimate documents/media/archives still flow.
 */
const BLOCKED_MEDIA_TYPES = new Set<string>([
	"application/x-msdownload",
	"application/x-msdos-program",
	"application/x-executable",
	"application/x-dosexec",
	"application/x-elf",
	"application/x-mach-binary",
	"application/vnd.microsoft.portable-executable",
	"application/x-sh",
	"application/x-shellscript",
	"application/x-csh",
	"application/x-bat",
	"application/x-msi",
	"application/java-archive",
	"application/x-java-archive",
	"text/x-shellscript",
]);

/** Prefixes whose entire family is blocked (e.g. all `application/x-dosexec`). */
const BLOCKED_PREFIXES: readonly string[] = ["application/x-executable"];

/**
 * Throw a reason string when `mediaType` is on the upload block-list. The caller
 * (`requestUpload`) wraps this in a `BAD_REQUEST` tRPC error. Returns silently
 * when the type is allowed.
 */
export function isBlockedMediaType(mediaType: string): boolean {
	const t = mediaType.trim().toLowerCase().split(";")[0]?.trim() ?? "";
	if (t.length === 0) return true;
	if (BLOCKED_MEDIA_TYPES.has(t)) return true;
	return BLOCKED_PREFIXES.some((p) => t.startsWith(p));
}

/** Terminal scan verdict for a confirmed upload. */
export type ScanVerdict = "clean" | "quarantined";

/** Input/output contract for the scan engine (so a real scanner can drop in). */
export interface ScanInput {
	storageKey: string;
	sizeBytes: number;
	mediaType: string;
}
export interface ScanOutcome {
	verdict: ScanVerdict;
	result: DriveScanResult;
}

// Test seam (mirrors storage.ts's `setDriveStorageForTest`): a unit test can
// inject a verdict to exercise the quarantine/clean branches of `confirmUpload`
// WITHOUT a process-global `mock.module("./scan")` that would leak into sibling
// test files. `undefined` = use the real engine.
let scanOverride: ((input: ScanInput) => Promise<ScanOutcome>) | undefined;

/** Inject a scan engine for unit tests; pass `undefined` to clear. */
export function setScanObjectForTest(
	fn: ((input: ScanInput) => Promise<ScanOutcome>) | undefined,
): void {
	scanOverride = fn;
}

/**
 * Scan a just-confirmed object and return its verdict + the audit record to
 * persist on the file row. STUB engine: always `clean`. The real value is the
 * gate it powers — callers flip the file to this verdict and downstream reads
 * require `clean`. Replace the body with a real scanner without touching callers.
 */
export async function scanObject(input: ScanInput): Promise<ScanOutcome> {
	if (scanOverride) return scanOverride(input);
	void input;
	return {
		verdict: "clean",
		result: {
			engine: "stub",
			verdict: "clean",
			ts: new Date().toISOString(),
		},
	};
}
