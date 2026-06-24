import { ROX_AI_BASE_URL } from "@rox/shared/chat-models";
import { observable } from "@trpc/server/observable";
import { desktopCapturer, systemPreferences } from "electron";
import type { SpectreWindowManager } from "main/windows/spectre";
import { capturePrimaryScreenPng } from "main/windows/spectre/captureScreen";
import { streamSpectreCompletion } from "main/windows/spectre/spectreCompletion";
import { z } from "zod";
import { publicProcedure, router } from "../..";

// Module-level handle set from main/index.ts once the manager is constructed,
// so the router can drive stealth/hide on the overlay window.
let spectreManager: SpectreWindowManager | null = null;
export function setSpectreManager(mgr: SpectreWindowManager): void {
	spectreManager = mgr;
}

function gatewayConfig(): { baseUrl: string; apiKey: string } {
	return {
		baseUrl: process.env.ROX_AI_BASE_URL || ROX_AI_BASE_URL,
		apiKey: process.env.ROX_AI_API_KEY ?? "",
	};
}

export const createSpectreRouter = () =>
	router({
		setStealth: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				spectreManager?.setStealth(input.enabled);
				return { ok: true };
			}),

		hide: publicProcedure.mutation(() => {
			spectreManager?.hide();
			return { ok: true };
		}),

		captureScreen: publicProcedure.query(async () =>
			capturePrimaryScreenPng({
				getMediaAccessStatus: (mediaType) =>
					systemPreferences.getMediaAccessStatus(mediaType),
				getSources: (opts) => desktopCapturer.getSources(opts),
			}),
		),

		// Stream the grok-4.3 answer. trpc-electron requires an observable (not an
		// async generator), so we drive the completion generator into emit.next.
		ask: publicProcedure
			.input(
				z.object({
					prompt: z.string().min(1),
					imagePngBase64: z.string().nullable(),
				}),
			)
			.subscription(({ input }) =>
				observable<{ type: "token" | "done"; text?: string }>((emit) => {
					const controller = new AbortController();
					void (async () => {
						try {
							for await (const token of streamSpectreCompletion(input, {
								...gatewayConfig(),
								signal: controller.signal,
							})) {
								emit.next({ type: "token", text: token });
							}
							emit.next({ type: "done" });
							emit.complete();
						} catch (error) {
							emit.error(error as Error);
						}
					})();
					return () => controller.abort();
				}),
			),
	});

export type SpectreRouter = ReturnType<typeof createSpectreRouter>;
