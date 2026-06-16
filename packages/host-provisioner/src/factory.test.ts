import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DaytonaProvisioner } from "./daytona";
import { E2BProvisioner } from "./e2b";
import {
	getHostProvisioner,
	listAvailableProviders,
	MissingProvisionerCredentialsError,
} from "./factory";
import { ModalProvisioner } from "./modal";

const ENV_KEYS = ["DAYTONA_API_KEY", "MODAL_API_KEY", "E2B_API_KEY"] as const;

describe("getHostProvisioner", () => {
	const saved: Record<string, string | undefined> = {};

	beforeEach(() => {
		for (const key of ENV_KEYS) {
			saved[key] = process.env[key];
			delete process.env[key];
		}
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	});

	it("builds each adapter from an explicit api key", () => {
		expect(getHostProvisioner("daytona", { apiKey: "k" })).toBeInstanceOf(
			DaytonaProvisioner,
		);
		expect(getHostProvisioner("modal", { apiKey: "k" })).toBeInstanceOf(
			ModalProvisioner,
		);
		expect(getHostProvisioner("e2b", { apiKey: "k" })).toBeInstanceOf(
			E2BProvisioner,
		);
	});

	it("reads the api key from env when not provided", () => {
		process.env.E2B_API_KEY = "env-key";
		expect(getHostProvisioner("e2b")).toBeInstanceOf(E2BProvisioner);
	});

	it("prefers an explicit api key over the env credential", () => {
		// A per-request (locally-saved) key must override the server env key so a
		// user can provision with their own credential.
		process.env.DAYTONA_API_KEY = "env-key";
		expect(
			getHostProvisioner("daytona", { apiKey: "request-key" }),
		).toBeInstanceOf(DaytonaProvisioner);
	});

	it("throws when credentials are missing", () => {
		expect(() => getHostProvisioner("modal")).toThrow(
			MissingProvisionerCredentialsError,
		);
	});

	it("lists only providers with configured credentials", () => {
		process.env.DAYTONA_API_KEY = "k";
		expect(listAvailableProviders()).toEqual(["daytona"]);
	});
});
