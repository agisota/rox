import { describe, expect, test } from "bun:test";
import { resolveStorageConfig, type StorageEnv } from "./config";

const baseCreds: StorageEnv = {
	STORAGE_ACCESS_KEY_ID: "ak",
	STORAGE_SECRET_ACCESS_KEY: "sk",
	STORAGE_BUCKET: "bucket",
};

describe("resolveStorageConfig", () => {
	test("defaults to the r2 provider", () => {
		const config = resolveStorageConfig({
			...baseCreds,
			R2_ACCOUNT_ID: "acct",
		});
		expect(config.kind).toBe("r2");
		if (config.kind === "r2") {
			expect(config.accountId).toBe("acct");
			expect(config.bucket).toBe("bucket");
			expect(config.credentials.accessKeyId).toBe("ak");
		}
	});

	test("resolves a minio config with path-style on by default", () => {
		const config = resolveStorageConfig({
			...baseCreds,
			STORAGE_PROVIDER: "minio",
			STORAGE_ENDPOINT: "https://s3.example.t",
		});
		expect(config.kind).toBe("minio");
		if (config.kind === "minio") {
			expect(config.endpoint).toBe("https://s3.example.t");
			expect(config.forcePathStyle).toBe(true);
		}
	});

	test("disables minio path-style when explicitly set to false", () => {
		const config = resolveStorageConfig({
			...baseCreds,
			STORAGE_PROVIDER: "minio",
			STORAGE_ENDPOINT: "https://s3.example.t",
			STORAGE_FORCE_PATH_STYLE: "false",
		});
		if (config.kind === "minio") {
			expect(config.forcePathStyle).toBe(false);
		}
	});

	test("threads an optional session token", () => {
		const config = resolveStorageConfig({
			...baseCreds,
			R2_ACCOUNT_ID: "acct",
			STORAGE_SESSION_TOKEN: "tok",
		});
		expect(config.credentials.sessionToken).toBe("tok");
	});

	test("rejects an unknown provider", () => {
		expect(() =>
			resolveStorageConfig({ ...baseCreds, STORAGE_PROVIDER: "gcs" }),
		).toThrow(/unsupported STORAGE_PROVIDER/);
	});

	test("fails fast when access key is missing", () => {
		expect(() =>
			resolveStorageConfig({
				STORAGE_SECRET_ACCESS_KEY: "sk",
				STORAGE_BUCKET: "b",
				R2_ACCOUNT_ID: "acct",
			}),
		).toThrow(/STORAGE_ACCESS_KEY_ID/);
	});

	test("fails fast when r2 account id is missing", () => {
		expect(() => resolveStorageConfig(baseCreds)).toThrow(/R2_ACCOUNT_ID/);
	});

	test("fails fast when minio endpoint is missing", () => {
		expect(() =>
			resolveStorageConfig({ ...baseCreds, STORAGE_PROVIDER: "minio" }),
		).toThrow(/STORAGE_ENDPOINT/);
	});
});
