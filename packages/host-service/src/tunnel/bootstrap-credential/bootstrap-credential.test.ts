import { describe, expect, it } from "bun:test";
import {
	hasHostCredential,
	resolveHostCredentialSource,
} from "./bootstrap-credential";

describe("resolveHostCredentialSource", () => {
	it("prefers the config-file source above all static tokens", () => {
		expect(
			resolveHostCredentialSource({
				hasConfigSource: true,
				relayBootstrapToken: "boot",
				authToken: "auth",
			}),
		).toEqual({ kind: "config" });
	});

	it("uses the relay bootstrap token over a static AUTH_TOKEN", () => {
		expect(
			resolveHostCredentialSource({
				hasConfigSource: false,
				relayBootstrapToken: "boot-123",
				authToken: "auth-456",
			}),
		).toEqual({ kind: "bootstrap", token: "boot-123" });
	});

	it("falls back to AUTH_TOKEN when no config or bootstrap token", () => {
		expect(
			resolveHostCredentialSource({
				hasConfigSource: false,
				authToken: "auth-456",
			}),
		).toEqual({ kind: "auth", token: "auth-456" });
	});

	it("reports none when no credential source is configured", () => {
		expect(resolveHostCredentialSource({ hasConfigSource: false })).toEqual({
			kind: "none",
		});
	});
});

describe("hasHostCredential", () => {
	it("is true when a bootstrap token is present without AUTH_TOKEN", () => {
		expect(
			hasHostCredential({
				hasConfigSource: false,
				relayBootstrapToken: "boot",
			}),
		).toBe(true);
	});

	it("is true with only AUTH_TOKEN", () => {
		expect(
			hasHostCredential({ hasConfigSource: false, authToken: "auth" }),
		).toBe(true);
	});

	it("is true with only a config source", () => {
		expect(hasHostCredential({ hasConfigSource: true })).toBe(true);
	});

	it("is false with no source at all", () => {
		expect(hasHostCredential({ hasConfigSource: false })).toBe(false);
	});
});
