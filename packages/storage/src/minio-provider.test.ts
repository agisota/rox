import { describe, expect, mock, test } from "bun:test";
import type { S3Client } from "@aws-sdk/client-s3";
import type { MinioConfig } from "./config";
import { createMinioClient, MinioProvider } from "./minio-provider";

const config: MinioConfig = {
	kind: "minio",
	endpoint: "https://s3.example.t",
	bucket: "artifacts",
	credentials: { accessKeyId: "ak", secretAccessKey: "sk" },
};

function mockClient() {
	const sent: unknown[] = [];
	const send = mock((command: unknown) => {
		sent.push(command);
		return Promise.resolve({});
	});
	return { client: { send } as unknown as S3Client, sent };
}

describe("createMinioClient", () => {
	test("uses path-style addressing and the configured endpoint by default", async () => {
		const client = createMinioClient(config);
		expect(await client.config.forcePathStyle).toBe(true);
		const endpoint = await client.config.endpoint?.();
		expect(endpoint?.hostname).toBe("s3.example.t");
		expect(await client.config.region()).toBe("us-east-1");
	});

	test("allows disabling path-style and overriding region", async () => {
		const client = createMinioClient({
			...config,
			forcePathStyle: false,
			region: "eu-central-1",
		});
		expect(await client.config.forcePathStyle).toBe(false);
		expect(await client.config.region()).toBe("eu-central-1");
	});
});

describe("MinioProvider", () => {
	test("reports kind minio and uses the injected client", async () => {
		const { client, sent } = mockClient();
		const provider = new MinioProvider(config, { client });
		expect(provider.kind).toBe("minio");
		await provider.copy({
			source: { key: "a" },
			destination: { key: "b" },
		});
		expect(sent).toHaveLength(1);
	});
});
