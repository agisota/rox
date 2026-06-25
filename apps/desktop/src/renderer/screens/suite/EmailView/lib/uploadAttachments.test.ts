import { describe, expect, mock, test } from "bun:test";
import type { DraftAttachment } from "../components/MailComposer";
import { sha256Hex, uploadDraftAttachments } from "./uploadAttachments";

/** A minimal File-like stub carrying bytes for `.arrayBuffer()`. */
function fakeFile(name: string, bytes: string): File {
	const buf = new TextEncoder().encode(bytes);
	return {
		name,
		size: buf.byteLength,
		type: "application/octet-stream",
		arrayBuffer: async () => buf.buffer,
	} as unknown as File;
}

describe("sha256Hex", () => {
	test("produces a 64-char lowercase hex digest", async () => {
		const bytes = new TextEncoder().encode("hello").buffer;
		const hex = await sha256Hex(bytes);
		expect(hex).toMatch(/^[a-f0-9]{64}$/);
		// Known sha256("hello").
		expect(hex).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});
});

describe("uploadDraftAttachments", () => {
	test("presigns + PUTs each new file and returns send-ready refs", async () => {
		const presign = mock(
			async (input: { sha256: string; filename: string }) => ({
				key: `mail/outbound/user-1/${input.sha256}`,
				url: `https://r2.test/put/${input.sha256}`,
			}),
		);
		const fetchImpl = mock(async () => new Response(null, { status: 200 }));

		const atts: DraftAttachment[] = [
			{ id: "1", name: "a.txt", size: 3, file: fakeFile("a.txt", "abc") },
		];
		const refs = await uploadDraftAttachments(
			atts,
			presign,
			fetchImpl as unknown as typeof fetch,
		);

		expect(presign).toHaveBeenCalledTimes(1);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		// PUT method was used to upload directly to R2.
		const init = (fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit;
		expect(init.method).toBe("PUT");
		expect(refs).toHaveLength(1);
		expect(refs[0]?.filename).toBe("a.txt");
		expect(refs[0]?.key).toContain("mail/outbound/user-1/");
	});

	test("passes an already-uploaded draft attachment through with NO re-upload", async () => {
		const presign = mock(async () => ({ key: "x", url: "y" }));
		const fetchImpl = mock(async () => new Response(null, { status: 200 }));

		const atts: DraftAttachment[] = [
			{
				id: "1",
				name: "old.pdf",
				size: 10,
				key: "mail/outbound/user-1/deadbeef",
				contentType: "application/pdf",
			},
		];
		const refs = await uploadDraftAttachments(
			atts,
			presign,
			fetchImpl as unknown as typeof fetch,
		);

		expect(presign).not.toHaveBeenCalled();
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(refs[0]?.key).toBe("mail/outbound/user-1/deadbeef");
		expect(refs[0]?.contentType).toBe("application/pdf");
	});

	test("throws when a staged attachment has neither bytes nor a key", async () => {
		const presign = mock(async () => ({ key: "x", url: "y" }));
		await expect(
			uploadDraftAttachments([{ id: "1", name: "ghost", size: 0 }], presign),
		).rejects.toThrow(/no file bytes/i);
	});

	test("throws when the R2 PUT fails", async () => {
		const presign = mock(async (input: { sha256: string }) => ({
			key: `mail/outbound/user-1/${input.sha256}`,
			url: "https://r2.test/put",
		}));
		const fetchImpl = mock(async () => new Response(null, { status: 403 }));
		await expect(
			uploadDraftAttachments(
				[{ id: "1", name: "a.txt", size: 3, file: fakeFile("a.txt", "abc") }],
				presign,
				fetchImpl as unknown as typeof fetch,
			),
		).rejects.toThrow(/HTTP 403/);
	});
});
