import { afterAll, describe, expect, test } from "bun:test";

const originalEnv = {
	AUTH_TOKEN: process.env.AUTH_TOKEN,
	HOST_DB_PATH: process.env.HOST_DB_PATH,
	HOST_MIGRATIONS_FOLDER: process.env.HOST_MIGRATIONS_FOLDER,
	HOST_SERVICE_SECRET: process.env.HOST_SERVICE_SECRET,
	ORGANIZATION_ID: process.env.ORGANIZATION_ID,
	PORT: process.env.PORT,
	ROX_API_URL: process.env.ROX_API_URL,
	ROX_AUTH_CONFIG_PATH: process.env.ROX_AUTH_CONFIG_PATH,
};

process.env.AUTH_TOKEN = "access-token";
process.env.HOST_DB_PATH = "/tmp/rox-host.db";
process.env.HOST_MIGRATIONS_FOLDER = "/tmp/rox-migrations";
process.env.HOST_SERVICE_SECRET = "host-secret";
process.env.ORGANIZATION_ID = "org_local_admin";
process.env.PORT = "4879";
process.env.ROX_API_URL = "https://api.rox.test";
delete process.env.ROX_AUTH_CONFIG_PATH;

const { env } = await import("./env");

afterAll(() => {
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

describe("host-service env", () => {
	test("ROX_AUTH_CONFIG_PATH is optional", () => {
		expect(env.ROX_AUTH_CONFIG_PATH).toBeUndefined();
		expect(env.AUTH_TOKEN).toBe("access-token");
	});

	test("ORGANIZATION_ID accepts non-UUID organization slugs", () => {
		expect(env.ORGANIZATION_ID).toBe("org_local_admin");
	});
});
