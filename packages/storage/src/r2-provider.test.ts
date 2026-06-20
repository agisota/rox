import { describe, expect, mock, test } from "bun:test";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { R2Config } from "./config";
import { createR2Client, R2Provider, r2Endpoint } from "./r2-provider";

const config: R2Config = {
	kind: "r2",
	accountId: "acct-123",
	bucket: "media",
	credentials: { accessKeyId: "ak", secretAccessKey: "sk" },
};

function mockClient() {
	const sent: unknown[] = [];
	const send = mock((command: unknown) => {
		sent.push(command);
		return Promise.resolve({ ContentLength: 0 });
	});
	return { client: { send } as unknown as S3Client, sent };
}

describe("r2Endpoint", () => {
	test("derives the cloudflarestorage endpoint from account id", () => {
		expect(r2Endpoint(config)).toBe(
			"https://acct-123.r2.cloudflarestorage.com",
		);
	});

	test("honors an explicit endpoint override", () => {
		expect(r2Endpoint({ ...config, endpoint: "https://custom.r2.t" })).toBe(
			"https://custom.r2.t",
		);
	});
});

describe("createR2Client", () => {
	test("configures region auto and the derived endpoint", async () => {
		const client = createR2Client(config);
		expect(await client.config.region()).toBe("auto");
		const endpoint = await client.config.endpoint?.();
		expect(endpoint?.hostname).toBe("acct-123.r2.cloudflarestorage.com");
	});
});

describe("R2Provider", () => {
	test("reports kind r2 and uses the injected client", async () => {
		const { client, sent } = mockClient();
		const provider = new R2Provider(config, { client });
		expect(provider.kind).toBe("r2");

		await provider.delete({ key: "k" });
		expect(sent).toHaveLength(1);
	});

	test("forwards presigning through the injected presigner", async () => {
		const { client } = mockClient();
		const presigner = mock(() => Promise.resolve("https://r2.signed/url"));
		const provider = new R2Provider(config, {
			client,
			presigner: presigner as never,
		});
		const result = await provider.presignPut({ key: "uploads/x" });
		expect(result.url).toBe("https://r2.signed/url");
		expect(presigner).toHaveBeenCalledTimes(1);
		const command = (presigner.mock.calls[0] as unknown[])[1];
		expect(command).toBeInstanceOf(PutObjectCommand);
	});
});
