import { describe, expect, it } from "bun:test";
import { ROX_R1, ROX_R1_MODEL_ID } from "@rox/shared/rox-models";

import {
	buildCatalogUpserts,
	modelsDevRowToCatalogEntry,
} from "./sync-model-catalog";

describe("modelsDevRowToCatalogEntry — pure transform", () => {
	it("maps a models.dev row to an InsertModelCatalog row", () => {
		const entry = modelsDevRowToCatalogEntry({
			id: "claude-sonnet-4",
			provider: "anthropic",
			cost: { input: 3, output: 15 },
			limit: { context: 200_000, output: 64_000 },
			modalities: { input: ["text", "image"], output: ["text"] },
			reasoning: true,
			tool_call: true,
		});

		expect(entry.provider).toBe("anthropic");
		expect(entry.modelId).toBe("claude-sonnet-4");
		expect(entry.publicUsdPerMIn).toBe("3");
		expect(entry.publicUsdPerMOut).toBe("15");
		// resolveProviderFamily keys off provider/model id → anthropic.
		expect(entry.pricingFamily).toBe("anthropic");
		expect(entry.isFree).toBe(false);
	});

	it("derives the pricing family from the model id when provider is generic", () => {
		const entry = modelsDevRowToCatalogEntry({
			id: "gpt-4o-mini",
			provider: "openrouter",
			cost: { input: 0.15, output: 0.6 },
		});
		expect(entry.pricingFamily).toBe("openai");
	});

	it("flags a zero-cost model as free", () => {
		const entry = modelsDevRowToCatalogEntry({
			id: "free-thing",
			provider: "someprovider",
			cost: { input: 0, output: 0 },
		});
		expect(entry.isFree).toBe(true);
		expect(entry.pricingFamily).toBe("other");
	});

	it("collapses missing/non-finite costs to 0 (never an unbounded price)", () => {
		const entry = modelsDevRowToCatalogEntry({
			id: "weird",
			provider: "x",
			// biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
			cost: { input: "nope" as any },
		});
		expect(entry.publicUsdPerMIn).toBe("0");
		expect(entry.publicUsdPerMOut).toBe("0");
		expect(entry.isFree).toBe(true);
	});
});

describe("buildCatalogUpserts — always seeds ROX_R1 first", () => {
	it("prepends the free ROX_R1 house model and dedupes by model id", () => {
		const rows = buildCatalogUpserts([
			{
				id: "claude-sonnet-4",
				provider: "anthropic",
				cost: { input: 3, output: 15 },
			},
			// A row that collides with ROX_R1's model id must not duplicate it.
			{ id: ROX_R1_MODEL_ID, provider: "rox", cost: { input: 0, output: 0 } },
		]);

		const r1Rows = rows.filter((r) => r.modelId === ROX_R1_MODEL_ID);
		expect(r1Rows).toHaveLength(1);
		expect(r1Rows[0]?.isFree).toBe(true);
		expect(r1Rows[0]?.provider).toBe(ROX_R1.provider);
		// ROX_R1 is first so a partial sync still leaves the free model present.
		expect(rows[0]?.modelId).toBe(ROX_R1_MODEL_ID);
		expect(rows.some((r) => r.modelId === "claude-sonnet-4")).toBe(true);
	});

	it("returns just ROX_R1 for an empty catalog", () => {
		const rows = buildCatalogUpserts([]);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.modelId).toBe(ROX_R1_MODEL_ID);
	});
});
