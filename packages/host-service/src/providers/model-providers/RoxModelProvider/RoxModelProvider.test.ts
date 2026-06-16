import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ROX_AI_API_KEY_ENV,
	ROX_AI_BASE_URL,
	ROX_AI_BASE_URL_ENV,
	ROX_AI_MODEL_ENV,
	ROX_KEY_PROVISION_TOKEN_ENV,
	ROX_KEY_PROVISION_URL_ENV,
} from "@rox/shared/chat-models";
import { LocalModelProvider } from "../LocalModelProvider";
import { RoxKeyProvisioner } from "./RoxKeyProvisioner";
import { resolveRoxRuntimeEnv } from "./rox-runtime-env";

const ROX_KEYS = [
	ROX_AI_API_KEY_ENV,
	ROX_AI_BASE_URL_ENV,
	ROX_AI_MODEL_ENV,
	ROX_KEY_PROVISION_URL_ENV,
	ROX_KEY_PROVISION_TOKEN_ENV,
	"OPENAI_API_KEY",
	"OPENAI_BASE_URL",
];

function snapshotEnv(): Record<string, string | undefined> {
	const snapshot: Record<string, string | undefined> = {};
	for (const key of ROX_KEYS) snapshot[key] = process.env[key];
	return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
	for (const key of ROX_KEYS) {
		const value = snapshot[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

describe("RoxKeyProvisioner", () => {
	let envSnapshot: Record<string, string | undefined>;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		for (const key of ROX_KEYS) delete process.env[key];
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
	});

	test("prefers a statically-provided env key over provisioning", async () => {
		const fetchImpl = mock(async () => new Response("{}"));
		const provisioner = new RoxKeyProvisioner({
			env: () => ({ [ROX_AI_API_KEY_ENV]: "static-key" }),
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});

		const result = await provisioner.resolveKey("user-1");
		expect(result).toEqual({ kind: "ok", apiKey: "static-key", source: "env" });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	test("reports unconfigured when neither key nor URL is set", async () => {
		const provisioner = new RoxKeyProvisioner({ env: () => ({}) });
		expect(await provisioner.resolveKey("user-1")).toEqual({
			kind: "unconfigured",
		});
		expect(provisioner.isConfigured()).toBe(false);
	});

	test("provisions a per-user key and caches it (one fetch per user)", async () => {
		const fetchImpl = mock(
			async () =>
				new Response(JSON.stringify({ apiKey: "minted-key" }), {
					status: 200,
				}),
		);
		const provisioner = new RoxKeyProvisioner({
			env: () => ({
				[ROX_KEY_PROVISION_URL_ENV]: "https://provision.example/key",
				[ROX_KEY_PROVISION_TOKEN_ENV]: "admin-token",
			}),
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});

		const first = await provisioner.resolveKey("user-1");
		const second = await provisioner.resolveKey("user-1");
		expect(first).toEqual({
			kind: "ok",
			apiKey: "minted-key",
			source: "provisioned",
		});
		expect(second).toEqual(first);
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		const [, requestInit] = fetchImpl.mock.calls[0] as unknown as [
			string,
			{ headers: Record<string, string>; body: string },
		];
		expect(requestInit.headers.authorization).toBe("Bearer admin-token");
		expect(JSON.parse(requestInit.body)).toEqual({ userId: "user-1" });
	});

	test("accepts api_key and key JSON shapes", async () => {
		const provisioner = new RoxKeyProvisioner({
			env: () => ({ [ROX_KEY_PROVISION_URL_ENV]: "https://p/key" }),
			fetchImpl: (async () =>
				new Response(JSON.stringify({ key: "snake" }), {
					status: 200,
				})) as unknown as typeof fetch,
		});
		expect(await provisioner.resolveKey("u")).toEqual({
			kind: "ok",
			apiKey: "snake",
			source: "provisioned",
		});
	});

	test("surfaces a typed error on HTTP failure rather than throwing", async () => {
		const provisioner = new RoxKeyProvisioner({
			env: () => ({ [ROX_KEY_PROVISION_URL_ENV]: "https://p/key" }),
			fetchImpl: (async () =>
				new Response("nope", { status: 503 })) as unknown as typeof fetch,
		});
		const result = await provisioner.resolveKey("u");
		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.message).toContain("503");
		}
	});

	test("surfaces a typed error when the body has no usable key", async () => {
		const provisioner = new RoxKeyProvisioner({
			env: () => ({ [ROX_KEY_PROVISION_URL_ENV]: "https://p/key" }),
			fetchImpl: (async () =>
				new Response(JSON.stringify({ nope: true }), {
					status: 200,
				})) as unknown as typeof fetch,
		});
		const result = await provisioner.resolveKey("u");
		expect(result.kind).toBe("error");
	});
});

describe("resolveRoxRuntimeEnv", () => {
	test("is a no-op for non-Rox models", async () => {
		const provisioner = new RoxKeyProvisioner({
			env: () => ({ [ROX_AI_API_KEY_ENV]: "static-key" }),
		});
		const result = await resolveRoxRuntimeEnv(
			{ selectedModelId: "anthropic/claude-opus-4-8" },
			provisioner,
		);
		expect(result).toEqual({ env: {}, isRoxModel: false, error: null });
	});

	test("returns OpenAI-compatible env pointing at the Rox endpoint", async () => {
		const provisioner = new RoxKeyProvisioner({
			env: () => ({ [ROX_AI_API_KEY_ENV]: "rox-key" }),
		});
		const result = await resolveRoxRuntimeEnv(
			{ selectedModelId: "r1" },
			provisioner,
		);
		expect(result.isRoxModel).toBe(true);
		expect(result.error).toBeNull();
		expect(result.env).toEqual({
			OPENAI_API_KEY: "rox-key",
			OPENAI_BASE_URL: ROX_AI_BASE_URL,
		});
	});

	test("honors ROX_AI_BASE_URL for the OpenAI base URL", async () => {
		// resolveRoxBaseUrl() reads process.env; the per-test snapshot clears it.
		process.env[ROX_AI_BASE_URL_ENV] = "https://api.rox.one/v1";
		const provisioner = new RoxKeyProvisioner({
			env: () => ({ [ROX_AI_API_KEY_ENV]: "rox-key" }),
		});
		const result = await resolveRoxRuntimeEnv(
			{ selectedModelId: "r1" },
			provisioner,
		);
		expect(result.env).toEqual({
			OPENAI_API_KEY: "rox-key",
			OPENAI_BASE_URL: "https://api.rox.one/v1",
		});
	});

	test("flags an error (no env) when Rox is selected but unconfigured", async () => {
		const provisioner = new RoxKeyProvisioner({ env: () => ({}) });
		const result = await resolveRoxRuntimeEnv(
			{ selectedModelId: "rox-r1" },
			provisioner,
		);
		expect(result.isRoxModel).toBe(true);
		expect(result.env).toEqual({});
		expect(result.error).toBeTruthy();
	});
});

describe("LocalModelProvider Rox branch", () => {
	let envSnapshot: Record<string, string | undefined>;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		for (const key of ROX_KEYS) delete process.env[key];
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
	});

	test("sets OPENAI_BASE_URL + OPENAI_API_KEY in process.env for the Rox model", async () => {
		process.env[ROX_AI_API_KEY_ENV] = "rox-key";
		const provider = new LocalModelProvider({
			roxKeyProvisioner: new RoxKeyProvisioner({
				env: () => process.env as Record<string, string | undefined>,
			}),
		});

		expect(
			await provider.hasUsableRuntimeEnv({ selectedModelId: "compound" }),
		).toBe(true);
		await provider.prepareRuntimeEnv({ selectedModelId: "compound" });

		expect(process.env.OPENAI_BASE_URL).toBe(ROX_AI_BASE_URL);
		expect(process.env.OPENAI_API_KEY).toBe("rox-key");
	});

	test("clears the Rox OpenAI env when switching back to a non-Rox model", async () => {
		process.env[ROX_AI_API_KEY_ENV] = "rox-key";
		const provider = new LocalModelProvider({
			anthropicEnvConfigPath: "/nonexistent/anthropic-env.json",
			roxKeyProvisioner: new RoxKeyProvisioner({
				env: () => process.env as Record<string, string | undefined>,
			}),
		});

		await provider.prepareRuntimeEnv({ selectedModelId: "compound" });
		expect(process.env.OPENAI_BASE_URL).toBe(ROX_AI_BASE_URL);

		// Switching to a non-Rox model must strip the Rox-specific OpenAI base URL
		// so the next model doesn't accidentally talk to the Rox endpoint.
		await provider.prepareRuntimeEnv({
			selectedModelId: "anthropic/claude-opus-4-8",
		});
		expect(process.env.OPENAI_BASE_URL).toBeUndefined();
	});

	test("hasUsableRuntimeEnv is false when the Rox model is selected but unconfigured", async () => {
		const provider = new LocalModelProvider({
			anthropicEnvConfigPath: "/nonexistent/anthropic-env.json",
			roxKeyProvisioner: new RoxKeyProvisioner({ env: () => ({}) }),
		});
		expect(
			await provider.hasUsableRuntimeEnv({ selectedModelId: "compound" }),
		).toBe(false);
	});
});
