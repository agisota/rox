import { afterEach, describe, expect, test } from "bun:test";
import { getObjectStore, resetRuntimeClients } from "./config";

const originalS3Endpoint = process.env.S3_ENDPOINT;

afterEach(() => {
	if (originalS3Endpoint === undefined) {
		delete process.env.S3_ENDPOINT;
	} else {
		process.env.S3_ENDPOINT = originalS3Endpoint;
	}
	resetRuntimeClients();
});

describe("runtime client config", () => {
	test("resets cached clients so env changes are observable in tests", async () => {
		process.env.S3_ENDPOINT = "http://127.0.0.1:19000";
		resetRuntimeClients();
		const firstUrl = await getObjectStore().presignGet("bucket", "one", 60);

		process.env.S3_ENDPOINT = "http://127.0.0.1:29000";
		const cachedUrl = await getObjectStore().presignGet("bucket", "two", 60);
		resetRuntimeClients();
		const resetUrl = await getObjectStore().presignGet("bucket", "three", 60);

		expect(firstUrl.startsWith("http://127.0.0.1:19000/")).toBe(true);
		expect(cachedUrl.startsWith("http://127.0.0.1:19000/")).toBe(true);
		expect(resetUrl.startsWith("http://127.0.0.1:29000/")).toBe(true);
	});
});
