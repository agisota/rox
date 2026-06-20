import { describe, expect, it, mock } from "bun:test";
import { performUpload, type RequestUploadResult } from "./performUpload";

function makeFile(name = "note.txt", type = "text/plain"): File {
	return new File([new TextEncoder().encode("hello")], name, { type });
}

describe("performUpload", () => {
	it("runs the full presigned handshake when not a dedup hit", async () => {
		const putBytes = mock(async () => {});
		const confirmUpload = mock(async () => ({ ok: true }));
		const requestUpload = mock(
			async (): Promise<RequestUploadResult> => ({
				dedup: false,
				fileId: "file-1",
				storageKey: "u/me/abc",
				upload: { url: "https://bucket/put", expiresAt: new Date() },
			}),
		);

		const file = makeFile();
		const outcome = await performUpload(file, "folder-1", {
			hash: async () => "a".repeat(64),
			requestUpload,
			putBytes,
			confirmUpload,
		});

		expect(outcome).toEqual({ fileId: "file-1", dedup: false });
		expect(requestUpload).toHaveBeenCalledTimes(1);
		expect(requestUpload.mock.calls[0]?.[0]).toMatchObject({
			filename: "note.txt",
			mediaType: file.type,
			sha256: "a".repeat(64),
			folderId: "folder-1",
		});
		expect(putBytes).toHaveBeenCalledTimes(1);
		expect(putBytes.mock.calls[0]?.[0]).toBe("https://bucket/put");
		expect(confirmUpload).toHaveBeenCalledTimes(1);
		expect(confirmUpload.mock.calls[0]?.[0]).toEqual({ fileId: "file-1" });
	});

	it("short-circuits on a dedup hit without PUT or confirm", async () => {
		const putBytes = mock(async () => {});
		const confirmUpload = mock(async () => ({ ok: true }));

		const outcome = await performUpload(makeFile(), null, {
			hash: async () => "b".repeat(64),
			requestUpload: async () => ({
				dedup: true,
				fileId: "existing-1",
				storageKey: "u/me/abc",
				upload: null,
			}),
			putBytes,
			confirmUpload,
		});

		expect(outcome).toEqual({ fileId: "existing-1", dedup: true });
		expect(putBytes).not.toHaveBeenCalled();
		expect(confirmUpload).not.toHaveBeenCalled();
	});

	it("falls back to a generic media type for typeless files", async () => {
		const requestUpload = mock(
			async (): Promise<RequestUploadResult> => ({
				dedup: true,
				fileId: "f",
				storageKey: "k",
				upload: null,
			}),
		);
		await performUpload(makeFile("blob", ""), null, {
			hash: async () => "c".repeat(64),
			requestUpload,
			putBytes: async () => {},
			confirmUpload: async () => ({}),
		});
		expect(requestUpload.mock.calls[0]?.[0]?.mediaType).toBe(
			"application/octet-stream",
		);
	});

	it("throws when a non-dedup response is missing the presigned URL", async () => {
		await expect(
			performUpload(makeFile(), null, {
				hash: async () => "d".repeat(64),
				requestUpload: async () => ({
					dedup: false,
					fileId: "f",
					storageKey: "k",
					upload: null,
				}),
				putBytes: async () => {},
				confirmUpload: async () => ({}),
			}),
		).rejects.toThrow("no presigned URL");
	});
});
