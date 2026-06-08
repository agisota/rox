/**
 * Cost-saving recommendations derived from a user's recent usage requests
 * (be-11), in the spirit of stats.api.zed's per-model suggestions.
 *
 * Pure + deterministic so it can be unit-tested and rendered server-side.
 */

export interface UsageRow {
	modelId: string;
	tokensIn: number;
	tokensOut: number;
	usdCost: number;
	roxCost: number;
}

const ROX_R1_MODEL_ID = "rox-r1";

export function buildRecommendations(rows: readonly UsageRow[]): string[] {
	if (rows.length === 0) return [];

	const recommendations: string[] = [];

	// Aggregate Rox spend per model.
	const spendByModel = new Map<string, number>();
	for (const row of rows) {
		spendByModel.set(
			row.modelId,
			(spendByModel.get(row.modelId) ?? 0) + row.roxCost,
		);
	}

	const totalRox = rows.reduce((sum, row) => sum + row.roxCost, 0);

	// Highlight the single most expensive model if it dominates spend.
	const ranked = [...spendByModel.entries()].sort((a, b) => b[1] - a[1]);
	const topModel = ranked[0];
	if (topModel && topModel[0] !== ROX_R1_MODEL_ID && totalRox > 0) {
		const share = topModel[1] / totalRox;
		if (share >= 0.5) {
			recommendations.push(
				`${topModel[0]} accounts for ${Math.round(
					share * 100,
				)}% of your spend — try Rox R1 (free) for routine tasks.`,
			);
		}
	}

	// Flag paid usage when a free model is available.
	const usesFreeModel = rows.some((row) => row.modelId === ROX_R1_MODEL_ID);
	const paidRox = rows
		.filter((row) => row.modelId !== ROX_R1_MODEL_ID)
		.reduce((sum, row) => sum + row.roxCost, 0);
	if (!usesFreeModel && paidRox > 0) {
		recommendations.push(
			"You haven't used Rox R1 yet — it's free forever and handles web search + code execution.",
		);
	}

	// Suggest trimming oversized prompts.
	const avgTokensIn =
		rows.reduce((sum, row) => sum + row.tokensIn, 0) / rows.length;
	if (avgTokensIn > 50_000) {
		recommendations.push(
			"Your average prompt is large — pruning context can meaningfully reduce per-request Rox cost.",
		);
	}

	return recommendations;
}
