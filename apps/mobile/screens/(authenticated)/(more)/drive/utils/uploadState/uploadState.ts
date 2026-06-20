/**
 * Pure state machine for a single Drive upload through the presigned flow:
 *
 *   idle → hashing → requesting → uploading → confirming → done
 *                                       ↘ (dedup) ↗
 *   any → error  /  done|error → idle (reset)
 *
 * Keeping the transitions + progress math out of the React hook makes the
 * upload lifecycle deterministic and unit-testable. The hook just feeds events
 * in and renders {@link UploadState}.
 */

export type UploadPhase =
	| "idle"
	| "hashing"
	| "requesting"
	| "uploading"
	| "confirming"
	| "done"
	| "error";

export interface UploadState {
	phase: UploadPhase;
	/** Display name of the file being uploaded (null when idle). */
	filename: string | null;
	/** 0–100 PUT progress; only meaningful while `phase === "uploading"`. */
	progress: number;
	/** Populated only when `phase === "error"`. */
	error: string | null;
}

export type UploadEvent =
	| { type: "pick"; filename: string }
	| { type: "request" }
	| { type: "upload" }
	| { type: "progress"; bytesSent: number; totalBytes: number }
	| { type: "confirm" }
	| { type: "done" }
	| { type: "fail"; error: string }
	| { type: "reset" };

export const INITIAL_UPLOAD_STATE: UploadState = {
	phase: "idle",
	filename: null,
	progress: 0,
	error: null,
};

/** Clamp PUT progress to a whole 0–100 percentage. */
export function uploadProgressPercent(
	bytesSent: number,
	totalBytes: number,
): number {
	if (totalBytes <= 0) return 0;
	const pct = Math.round((bytesSent / totalBytes) * 100);
	if (pct < 0) return 0;
	if (pct > 100) return 100;
	return pct;
}

export function uploadReducer(
	state: UploadState,
	event: UploadEvent,
): UploadState {
	switch (event.type) {
		case "pick":
			return {
				phase: "hashing",
				filename: event.filename,
				progress: 0,
				error: null,
			};
		case "request":
			return { ...state, phase: "requesting", error: null };
		case "upload":
			return { ...state, phase: "uploading", progress: 0, error: null };
		case "progress":
			return {
				...state,
				phase: "uploading",
				progress: uploadProgressPercent(event.bytesSent, event.totalBytes),
			};
		case "confirm":
			return { ...state, phase: "confirming", progress: 100, error: null };
		case "done":
			return { ...state, phase: "done", progress: 100, error: null };
		case "fail":
			return { ...state, phase: "error", error: event.error };
		case "reset":
			return INITIAL_UPLOAD_STATE;
		default:
			return state;
	}
}

/** True while an upload is mid-flight (any non-terminal, non-idle phase). */
export function isUploadActive(phase: UploadPhase): boolean {
	return (
		phase === "hashing" ||
		phase === "requesting" ||
		phase === "uploading" ||
		phase === "confirming"
	);
}

/** Human label for the current phase, for the inline upload banner. */
export function uploadPhaseLabel(phase: UploadPhase): string {
	switch (phase) {
		case "hashing":
			return "Preparing…";
		case "requesting":
			return "Requesting upload…";
		case "uploading":
			return "Uploading…";
		case "confirming":
			return "Finishing…";
		case "done":
			return "Uploaded";
		case "error":
			return "Upload failed";
		default:
			return "";
	}
}
