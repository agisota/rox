import { describe, expect, mock, test } from "bun:test";
import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { S3BaseProvider } from "./s3-base.ts";

/** A mock S3Client that records sent commands and returns canned responses. */
function mockClient(response: unknown = {}) {
	const sent: unknown[] = [];
	const send = mock((command: unknown) => {
		sent.push(command);
		return Promise.resolve(response);
	});
	return { client: { send } as unknown as S3Client, sent, send };
}

/** A presigner stub that records its args and returns a deterministic URL. */
function mockPresigner() {
	const calls: { command: unknown; options: unknown }[] = [];
	const presigner = mock(
		(_client: unknown, command: unknown, options: unknown) => {
			calls.push({ command, options });
			return Promise.resolve("https://signed.example/url");
		},
	);
	return { presigner: presigner as never, calls };
}

function makeProvider(opts?: { response?: unknown }) {
	const { client, sent } = mockClient(opts?.response);
	const { presigner, calls } = mockPresigner();
	const provider = new S3BaseProvider({
		client,
		bucket: "default-bucket",
		kind: "minio",
		presigner,
	});
	return { provider, sent, calls };
}

describe("S3BaseProvider", () => {
	test("exposes its backend kind", () => {
		const { provider } = makeProvider();
		expect(provider.kind).toBe("minio");
	});

	describe("presignPut", () => {
		test("builds a PutObjectCommand with default bucket and metadata", async () => {
			const { provider, calls } = makeProvider();
			const result = await provider.presignPut({
				key: "uploads/file.bin",
				contentType: "application/octet-stream",
				contentLength: 1024,
				metadata: { owner: "user-1" },
				expiresIn: 300,
			});

			expect(result.url).toBe("https://signed.example/url");
			expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

			expect(calls).toHaveLength(1);
			const call = calls[0];
			expect(call?.command).toBeInstanceOf(PutObjectCommand);
			const input = (call?.command as PutObjectCommand).input;
			expect(input.Bucket).toBe("default-bucket");
			expect(input.Key).toBe("uploads/file.bin");
			expect(input.ContentType).toBe("application/octet-stream");
			expect(input.ContentLength).toBe(1024);
			expect(input.Metadata).toEqual({ owner: "user-1" });
			expect(call?.options).toEqual({ expiresIn: 300 });
		});

		test("honors an explicit bucket override and default expiry", async () => {
			const { provider, calls } = makeProvider();
			await provider.presignPut({ key: "k", bucket: "other-bucket" });
			const input = (calls[0]?.command as PutObjectCommand).input;
			expect(input.Bucket).toBe("other-bucket");
			// default presign window is 900s
			expect(calls[0]?.options).toEqual({ expiresIn: 900 });
		});
	});

	describe("presignGet", () => {
		test("builds a GetObjectCommand and sets content-disposition", async () => {
			const { provider, calls } = makeProvider();
			await provider.presignGet({
				key: "docs/report.pdf",
				downloadFilename: "report.pdf",
			});
			const call = calls[0];
			expect(call?.command).toBeInstanceOf(GetObjectCommand);
			const input = (call?.command as GetObjectCommand).input;
			expect(input.Key).toBe("docs/report.pdf");
			expect(input.ResponseContentDisposition).toBe(
				'attachment; filename="report.pdf"',
			);
		});
	});

	describe("head", () => {
		test("sends HeadObjectCommand and maps the response", async () => {
			const lastModified = new Date("2026-01-01T00:00:00Z");
			const { provider, sent } = makeProvider({
				response: {
					ContentLength: 2048,
					ContentType: "image/png",
					ETag: '"abc123"',
					LastModified: lastModified,
					Metadata: { kind: "avatar" },
				},
			});
			const result = await provider.head({ key: "a/b.png" });

			expect(sent[0]).toBeInstanceOf(HeadObjectCommand);
			expect((sent[0] as HeadObjectCommand).input).toEqual({
				Bucket: "default-bucket",
				Key: "a/b.png",
			});
			expect(result).toEqual({
				contentLength: 2048,
				contentType: "image/png",
				etag: '"abc123"',
				lastModified,
				metadata: { kind: "avatar" },
			});
		});

		test("defaults contentLength to 0 when missing", async () => {
			const { provider } = makeProvider({ response: {} });
			const result = await provider.head({ key: "x" });
			expect(result.contentLength).toBe(0);
		});
	});

	describe("delete", () => {
		test("sends DeleteObjectCommand with the right key/bucket", async () => {
			const { provider, sent } = makeProvider();
			await provider.delete({ key: "trash/old.txt" });
			expect(sent[0]).toBeInstanceOf(DeleteObjectCommand);
			expect((sent[0] as DeleteObjectCommand).input).toEqual({
				Bucket: "default-bucket",
				Key: "trash/old.txt",
			});
		});
	});

	describe("copy", () => {
		test("builds CopySource from source bucket + encoded key", async () => {
			const { provider, sent } = makeProvider();
			await provider.copy({
				source: { key: "src/with space.txt", bucket: "src-bucket" },
				destination: { key: "dst/copy.txt" },
				contentType: "text/plain",
			});
			expect(sent[0]).toBeInstanceOf(CopyObjectCommand);
			const input = (sent[0] as CopyObjectCommand).input;
			expect(input.Bucket).toBe("default-bucket");
			expect(input.Key).toBe("dst/copy.txt");
			expect(input.CopySource).toBe("src-bucket/src%2Fwith%20space.txt");
			expect(input.ContentType).toBe("text/plain");
			expect(input.MetadataDirective).toBe("REPLACE");
		});

		test("omits content-type directive when not provided", async () => {
			const { provider, sent } = makeProvider();
			await provider.copy({
				source: { key: "a" },
				destination: { key: "b" },
			});
			const input = (sent[0] as CopyObjectCommand).input;
			expect(input.MetadataDirective).toBeUndefined();
			expect(input.CopySource).toBe("default-bucket/a");
		});
	});

	describe("list", () => {
		test("sends ListObjectsV2Command and maps contents + cursor", async () => {
			const lastModified = new Date("2026-02-02T00:00:00Z");
			const { provider, sent } = makeProvider({
				response: {
					Contents: [
						{ Key: "p/1", Size: 10, LastModified: lastModified, ETag: '"e1"' },
						{ Key: "p/2", Size: 20 },
					],
					NextContinuationToken: "next-token",
				},
			});
			const result = await provider.list({
				prefix: "p/",
				maxKeys: 50,
				cursor: "prev-token",
			});

			expect(sent[0]).toBeInstanceOf(ListObjectsV2Command);
			expect((sent[0] as ListObjectsV2Command).input).toEqual({
				Bucket: "default-bucket",
				Prefix: "p/",
				MaxKeys: 50,
				ContinuationToken: "prev-token",
			});
			expect(result.cursor).toBe("next-token");
			expect(result.objects).toEqual([
				{ key: "p/1", size: 10, lastModified, etag: '"e1"' },
				{ key: "p/2", size: 20 },
			]);
		});

		test("returns an empty page with no cursor when nothing matches", async () => {
			const { provider } = makeProvider({ response: {} });
			const result = await provider.list();
			expect(result.objects).toEqual([]);
			expect(result.cursor).toBeUndefined();
		});
	});
});
