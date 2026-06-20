/**
 * models.dev → `model_catalog` sync (WS-E T7).
 *
 * Populates the prepaid-economy model catalog from models.dev so
 * `economy.models.list` has rows and the metering path (`settleRequest`) can read
 * public prices. The pure transform ({@link modelsDevRowToCatalogEntry} +
 * {@link buildCatalogUpserts}) is unit-tested with no network/DB; {@link runSync}
 * wires it to Drizzle and only runs when this file is executed directly
 * (`bun run packages/scripts/src/sync-model-catalog.ts`).
 *
 * The free house model {@link ROX_R1} is ALWAYS seeded first so a partial or
 * failed sync still leaves the free model present.
 */

import type { InsertModelCatalog } from "@rox/db/schema";
import { ROX_R1, ROX_R1_MODEL_ID } from "@rox/shared/rox-models";
import {
	type ModelProviderFamily,
	resolveProviderFamily,
} from "@rox/shared/rox-pricing";

/** The default models.dev catalog endpoint. */
export const MODELS_DEV_URL = "https://models.dev/api.json";

/** A loosely-typed models.dev catalog row (their schema is provider-shaped). */
export interface ModelsDevRow {
	id: string;
	provider?: string;
	cost?: { input?: unknown; output?: unknown };
	limit?: { context?: unknown; output?: unknown };
	modalities?: { input?: string[]; output?: string[] };
	reasoning?: boolean;
	tool_call?: boolean;
	[key: string]: unknown;
}

/** Parse a possibly-malformed price to a finite, non-negative number. */
function safePrice(value: unknown): number {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Map a models.dev row to an `InsertModelCatalog` row (pure). The pricing family
 * is derived from the provider id, falling back to the model id, so OpenRouter-
 * style generic providers still get the right divisor. A model whose public
 * input+output price collapses to 0 is flagged `isFree`.
 */
export function modelsDevRowToCatalogEntry(
	row: ModelsDevRow,
): InsertModelCatalog {
	const provider = row.provider ?? "unknown";
	const usdIn = safePrice(row.cost?.input);
	const usdOut = safePrice(row.cost?.output);
	const family: ModelProviderFamily = resolveProviderFamily(
		`${provider} ${row.id}`,
	);
	const isFree = usdIn === 0 && usdOut === 0;

	return {
		provider,
		modelId: row.id,
		publicUsdPerMIn: String(usdIn),
		publicUsdPerMOut: String(usdOut),
		pricingFamily: family,
		isFree,
		specs: {
			modalities: row.modalities,
			reasoning: row.reasoning,
		},
		tools: { toolCall: row.tool_call },
		limits: {
			contextWindow:
				typeof row.limit?.context === "number" ? row.limit.context : undefined,
			maxOutputTokens:
				typeof row.limit?.output === "number" ? row.limit.output : undefined,
		},
	};
}

/** The ROX_R1 house model as an `InsertModelCatalog` row. */
function roxR1Row(): InsertModelCatalog {
	return {
		provider: ROX_R1.provider,
		modelId: ROX_R1.modelId,
		publicUsdPerMIn: String(ROX_R1.publicUsdPerMIn),
		publicUsdPerMOut: String(ROX_R1.publicUsdPerMOut),
		pricingFamily: ROX_R1.pricingFamily,
		isFree: ROX_R1.isFree,
		params: ROX_R1.params,
		specs: ROX_R1.specs,
		tools: ROX_R1.tools,
		limits: ROX_R1.limits,
	};
}

/**
 * Build the full upsert set: ROX_R1 first, then every models.dev row, deduped by
 * model id (ROX_R1 wins so an upstream row claiming `rox-r1` can't overwrite the
 * free model's pricing).
 */
export function buildCatalogUpserts(
	rows: ModelsDevRow[],
): InsertModelCatalog[] {
	const seen = new Set<string>([ROX_R1_MODEL_ID]);
	const out: InsertModelCatalog[] = [roxR1Row()];
	for (const row of rows) {
		if (!row.id || seen.has(row.id)) continue;
		seen.add(row.id);
		out.push(modelsDevRowToCatalogEntry(row));
	}
	return out;
}

/** Fetch + flatten the models.dev catalog into rows. */
export async function fetchModelsDevCatalog(
	url: string = MODELS_DEV_URL,
): Promise<ModelsDevRow[]> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`models.dev fetch failed with status ${response.status}`);
	}
	const data = (await response.json()) as unknown;
	const rows: ModelsDevRow[] = [];
	// models.dev shape: { [providerId]: { models: { [modelId]: {...} } } }.
	if (data && typeof data === "object") {
		for (const [providerId, providerVal] of Object.entries(
			data as Record<string, unknown>,
		)) {
			const models = (providerVal as { models?: Record<string, unknown> })
				?.models;
			if (!models || typeof models !== "object") continue;
			for (const [modelId, modelVal] of Object.entries(models)) {
				rows.push({
					...(modelVal as Record<string, unknown>),
					id: modelId,
					provider: providerId,
				});
			}
		}
	}
	return rows;
}

/**
 * Run the sync against the live DB: fetch the catalog, build the upsert set, and
 * upsert each row keyed on the unique `model_id` index. Only invoked when this
 * file is executed directly — importing it (for the pure transform/tests) never
 * touches the DB.
 */
export async function runSync(url: string = MODELS_DEV_URL): Promise<number> {
	const { db } = await import("@rox/db/client");
	const { modelCatalog } = await import("@rox/db/schema");

	const rows = buildCatalogUpserts(await fetchModelsDevCatalog(url));
	for (const row of rows) {
		await db
			.insert(modelCatalog)
			.values(row)
			.onConflictDoUpdate({
				target: modelCatalog.modelId,
				set: {
					provider: row.provider,
					publicUsdPerMIn: row.publicUsdPerMIn,
					publicUsdPerMOut: row.publicUsdPerMOut,
					pricingFamily: row.pricingFamily,
					isFree: row.isFree,
					params: row.params,
					specs: row.specs,
					tools: row.tools,
					limits: row.limits,
				},
			});
	}
	return rows.length;
}

if (import.meta.main) {
	runSync()
		.then((count) => {
			console.info(`[sync-model-catalog] upserted ${count} models`);
			process.exit(0);
		})
		.catch((error) => {
			console.error("[sync-model-catalog] failed:", error);
			process.exit(1);
		});
}
