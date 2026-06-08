/**
 * Rox model catalog tRPC router (billing-economy epic, be-06).
 *
 *   catalog     → the models.dev-sourced catalog plus our free-forever rox r1,
 *                 each annotated with our Rox sell price per million tokens.
 *   comparison  → our price advantage vs the public per-Mtok price, alongside
 *                 the latency / TTFT / stability story used by the marketing and
 *                 account model-comparison surfaces.
 *
 * The sync job that populates `model_catalog` from models.dev is be-03.
 */

import { db } from "@rox/db/client";
import { modelCatalog } from "@rox/db/schema";
import { ROX_R1, type RoxModelCatalogEntry } from "@rox/shared/rox-models";
import {
	resolveProviderFamily,
	roxPricePerMillion,
} from "@rox/shared/rox-pricing";
import type { TRPCRouterRecord } from "@trpc/server";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../../trpc";

export interface CatalogEntry extends RoxModelCatalogEntry {
	/** Our Rox sell price per million input tokens (0 for free models). */
	roxPerMIn: number;
	/** Our Rox sell price per million output tokens (0 for free models). */
	roxPerMOut: number;
}

function toCatalogEntry(row: {
	provider: string;
	modelId: string;
	publicUsdPerMIn: string;
	publicUsdPerMOut: string;
	pricingFamily: RoxModelCatalogEntry["pricingFamily"];
	isFree: boolean;
	params: RoxModelCatalogEntry["params"] | null;
	specs: RoxModelCatalogEntry["specs"] | null;
	tools: RoxModelCatalogEntry["tools"] | null;
	limits: RoxModelCatalogEntry["limits"] | null;
}): CatalogEntry {
	const publicUsdPerMIn = Number(row.publicUsdPerMIn);
	const publicUsdPerMOut = Number(row.publicUsdPerMOut);
	return {
		provider: row.provider,
		modelId: row.modelId,
		publicUsdPerMIn,
		publicUsdPerMOut,
		pricingFamily: row.pricingFamily,
		isFree: row.isFree,
		params: row.params ?? {},
		specs: row.specs ?? {},
		tools: row.tools ?? {},
		limits: row.limits ?? {},
		roxPerMIn: row.isFree
			? 0
			: roxPricePerMillion(publicUsdPerMIn, row.modelId),
		roxPerMOut: row.isFree
			? 0
			: roxPricePerMillion(publicUsdPerMOut, row.modelId),
	};
}

/** rox r1 as a catalog entry (it lives in code, not necessarily in the DB). */
function roxR1Entry(): CatalogEntry {
	return { ...ROX_R1, roxPerMIn: 0, roxPerMOut: 0 };
}

export const modelsRouter = {
	catalog: publicProcedure
		.input(
			z
				.object({ includeFree: z.boolean().default(true) })
				.default({ includeFree: true }),
		)
		.query(async ({ input }) => {
			const rows = await db
				.select()
				.from(modelCatalog)
				.orderBy(asc(modelCatalog.provider), asc(modelCatalog.modelId));

			const entries = rows.map(toCatalogEntry);
			const hasRoxR1 = entries.some((e) => e.modelId === ROX_R1.modelId);
			if (input.includeFree && !hasRoxR1) {
				entries.unshift(roxR1Entry());
			}
			return entries;
		}),

	comparison: publicProcedure.query(async () => {
		const rows = await db
			.select()
			.from(modelCatalog)
			.orderBy(asc(modelCatalog.provider), asc(modelCatalog.modelId));

		const entries = rows.map(toCatalogEntry);
		if (!entries.some((e) => e.modelId === ROX_R1.modelId)) {
			entries.unshift(roxR1Entry());
		}

		return entries.map((entry) => {
			const family = resolveProviderFamily(entry.modelId);
			// Headline advantage = how many× cheaper our blended price is than the
			// public list price. Latency / TTFT / stability are the qualitative
			// story (data-sharing-free, ~2.5× faster) surfaced on the models page.
			const publicBlended = entry.publicUsdPerMIn + entry.publicUsdPerMOut;
			const roxBlendedUsd = (entry.roxPerMIn + entry.roxPerMOut) / 100; // rox → usd (100 rox/usdt)
			const priceAdvantage =
				roxBlendedUsd > 0 ? publicBlended / roxBlendedUsd : null;
			return {
				provider: entry.provider,
				modelId: entry.modelId,
				pricingFamily: family,
				isFree: entry.isFree,
				publicUsdPerMIn: entry.publicUsdPerMIn,
				publicUsdPerMOut: entry.publicUsdPerMOut,
				roxPerMIn: entry.roxPerMIn,
				roxPerMOut: entry.roxPerMOut,
				priceAdvantage,
				latencyMultiplier: 2.5,
				stability: "high" as const,
			};
		});
	}),
} satisfies TRPCRouterRecord;
