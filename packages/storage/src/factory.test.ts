import { describe, expect, test } from "bun:test";
import {
	createStorageProvider,
	createStorageProviderFromEnv,
} from "./factory.ts";
import { MinioProvider } from "./minio-provider.ts";
import { R2Provider } from "./r2-provider.ts";

describe("createStorageProvider", () => {
	test("builds an R2Provider for an r2 config", () => {
		const provider = createStorageProvider({
			kind: "r2",
			accountId: "acct",
			bucket: "b",
			credentials: { accessKeyId: "ak", secretAccessKey: "sk" },
		});
		expect(provider).toBeInstanceOf(R2Provider);
		expect(provider.kind).toBe("r2");
	});

	test("builds a MinioProvider for a minio config", () => {
		const provider = createStorageProvider({
			kind: "minio",
			endpoint: "https://s3.example.t",
			bucket: "b",
			credentials: { accessKeyId: "ak", secretAccessKey: "sk" },
		});
		expect(provider).toBeInstanceOf(MinioProvider);
		expect(provider.kind).toBe("minio");
	});
});

describe("createStorageProviderFromEnv", () => {
	test("resolves config and builds the matching provider", () => {
		const provider = createStorageProviderFromEnv({
			STORAGE_PROVIDER: "minio",
			STORAGE_ENDPOINT: "https://s3.example.t",
			STORAGE_BUCKET: "b",
			STORAGE_ACCESS_KEY_ID: "ak",
			STORAGE_SECRET_ACCESS_KEY: "sk",
		});
		expect(provider).toBeInstanceOf(MinioProvider);
	});
});
