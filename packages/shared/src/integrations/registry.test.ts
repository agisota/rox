import { describe, expect, it } from "bun:test";
import {
	getIntegrationMeta,
	integrationCatalog,
	integrationRegistry,
} from "./registry";

// Mirrors `integrationProviderValues` in @rox/db/schema. Kept inline so the
// shared package stays free of a DB dependency; if the enum changes, this test
// should be updated in lockstep with the registry.
const EXPECTED_PROVIDER_IDS = [
	"linear",
	"github",
	"slack",
	"telegram",
	"discord",
	"notion",
	"obsidian",
	"fibery",
	"lark",
] as const;

describe("integrationRegistry", () => {
	it("covers exactly the known provider enum values", () => {
		expect(Object.keys(integrationRegistry).sort()).toEqual(
			[...EXPECTED_PROVIDER_IDS].sort(),
		);
	});

	it("uses each map key as the entry id", () => {
		for (const [key, meta] of Object.entries(integrationRegistry)) {
			expect(meta.id).toBe(key);
		}
	});

	it("exposes a catalog in registry order", () => {
		expect(integrationCatalog.map((m) => m.id)).toEqual([
			...Object.keys(integrationRegistry),
		]);
	});

	it("gives every provider a non-empty name, description and accent color", () => {
		for (const meta of integrationCatalog) {
			expect(meta.name.length).toBeGreaterThan(0);
			expect(meta.description.length).toBeGreaterThan(0);
			expect(meta.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
		}
	});

	it("looks up metadata by id", () => {
		expect(getIntegrationMeta("telegram").name).toBe("Telegram");
		expect(getIntegrationMeta("telegram").authKind).toBe("bot_token");
		expect(getIntegrationMeta("obsidian").authKind).toBe("local");
	});
});
