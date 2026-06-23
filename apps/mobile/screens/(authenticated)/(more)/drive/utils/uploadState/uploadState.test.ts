import { describe, expect, test } from "bun:test";
import {
	INITIAL_UPLOAD_STATE,
	isUploadActive,
	type UploadState,
	uploadPhaseLabel,
	uploadProgressPercent,
	uploadReducer,
} from "./uploadState";

describe("uploadProgressPercent", () => {
	test("returns 0 when total is zero or negative", () => {
		expect(uploadProgressPercent(10, 0)).toBe(0);
		expect(uploadProgressPercent(10, -5)).toBe(0);
	});

	test("rounds to a whole percentage", () => {
		expect(uploadProgressPercent(1, 3)).toBe(33);
		expect(uploadProgressPercent(2, 3)).toBe(67);
		expect(uploadProgressPercent(512, 1024)).toBe(50);
	});

	test("clamps to the 0–100 range", () => {
		expect(uploadProgressPercent(200, 100)).toBe(100);
		expect(uploadProgressPercent(-1, 100)).toBe(0);
	});
});

describe("uploadReducer", () => {
	test("pick moves from idle to hashing and records the filename", () => {
		const next = uploadReducer(INITIAL_UPLOAD_STATE, {
			type: "pick",
			filename: "report.pdf",
		});
		expect(next.phase).toBe("hashing");
		expect(next.filename).toBe("report.pdf");
		expect(next.progress).toBe(0);
		expect(next.error).toBeNull();
	});

	test("drives the full happy path to done", () => {
		let state: UploadState = INITIAL_UPLOAD_STATE;
		state = uploadReducer(state, { type: "pick", filename: "a.png" });
		state = uploadReducer(state, { type: "request" });
		expect(state.phase).toBe("requesting");
		state = uploadReducer(state, { type: "upload" });
		expect(state.phase).toBe("uploading");
		state = uploadReducer(state, {
			type: "progress",
			bytesSent: 50,
			totalBytes: 100,
		});
		expect(state.progress).toBe(50);
		state = uploadReducer(state, { type: "confirm" });
		expect(state.phase).toBe("confirming");
		expect(state.progress).toBe(100);
		state = uploadReducer(state, { type: "done" });
		expect(state.phase).toBe("done");
		expect(state.filename).toBe("a.png");
	});

	test("fail captures the error message and keeps the filename", () => {
		const picked = uploadReducer(INITIAL_UPLOAD_STATE, {
			type: "pick",
			filename: "big.zip",
		});
		const failed = uploadReducer(picked, {
			type: "fail",
			error: "quota exceeded",
		});
		expect(failed.phase).toBe("error");
		expect(failed.error).toBe("quota exceeded");
		expect(failed.filename).toBe("big.zip");
	});

	test("reset returns to the initial state", () => {
		const failed: UploadState = {
			phase: "error",
			filename: "x",
			progress: 40,
			error: "boom",
		};
		expect(uploadReducer(failed, { type: "reset" })).toEqual(
			INITIAL_UPLOAD_STATE,
		);
	});
});

describe("isUploadActive", () => {
	test("is true for in-flight phases", () => {
		expect(isUploadActive("hashing")).toBe(true);
		expect(isUploadActive("requesting")).toBe(true);
		expect(isUploadActive("uploading")).toBe(true);
		expect(isUploadActive("confirming")).toBe(true);
	});

	test("is false for terminal and idle phases", () => {
		expect(isUploadActive("idle")).toBe(false);
		expect(isUploadActive("done")).toBe(false);
		expect(isUploadActive("error")).toBe(false);
	});
});

describe("uploadPhaseLabel", () => {
	test("returns a non-empty label for active and terminal phases", () => {
		expect(uploadPhaseLabel("uploading")).toBe("Uploading…");
		expect(uploadPhaseLabel("done")).toBe("Uploaded");
		expect(uploadPhaseLabel("error")).toBe("Upload failed");
	});

	test("returns empty for idle", () => {
		expect(uploadPhaseLabel("idle")).toBe("");
	});
});
