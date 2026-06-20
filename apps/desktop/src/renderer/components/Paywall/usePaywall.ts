import { logger } from "renderer/lib/logger";
import type { GatedFeature } from "./constants";

/**
 * #34.1: the Rox edition is free for everyone, so nothing is gated. This hook
 * is kept as a thin pass-through purely so the existing `gateFeature(...)` call
 * sites keep compiling — every feature is allowed and the callback runs
 * immediately.
 */
export function usePaywall() {
	function gateFeature(
		feature: GatedFeature,
		callback: () => void | Promise<void>,
	): void {
		try {
			const result = callback();
			if (result instanceof Promise) {
				result.catch((error) => {
					logger.error(`[paywall] Callback error for ${feature}:`, error);
				});
			}
		} catch (error) {
			logger.error(`[paywall] Callback error for ${feature}:`, error);
		}
	}

	return { gateFeature };
}
