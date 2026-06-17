import { observable } from "@trpc/server/observable";
import { session } from "electron";
import { browserManager } from "main/lib/browser/browser-manager";
import { designModeCaptureService } from "main/lib/browser/design-mode/designModeCaptureService";
import {
	captureElementInputSchema,
	createCustomPreset,
	type DesignModeEvent,
	getCaptureInputSchema,
	resolveDevicePreset,
	setDesignModeInputSchema,
	setDevicePresetInputSchema,
} from "shared/browser";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createBrowserRouter = () => {
	return router({
		register: publicProcedure
			.input(z.object({ paneId: z.string(), webContentsId: z.number() }))
			.mutation(({ input }) => {
				browserManager.register(input.paneId, input.webContentsId);
				return { success: true };
			}),

		unregister: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(async ({ input }) => {
				try {
					await designModeCaptureService.cleanup(input.paneId);
				} finally {
					// Always unregister even if cleanup throws, so the pane never
					// leaks its webContents listeners.
					browserManager.unregister(input.paneId);
				}
				return { success: true };
			}),

		navigate: publicProcedure
			.input(z.object({ paneId: z.string(), url: z.string() }))
			.mutation(({ input }) => {
				browserManager.navigate(input.paneId, input.url);
				return { success: true };
			}),

		goBack: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
				const wc = browserManager.getWebContents(input.paneId);
				if (wc?.canGoBack()) wc.goBack();
				return { success: true };
			}),

		goForward: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
				const wc = browserManager.getWebContents(input.paneId);
				if (wc?.canGoForward()) wc.goForward();
				return { success: true };
			}),

		reload: publicProcedure
			.input(z.object({ paneId: z.string(), hard: z.boolean().optional() }))
			.mutation(({ input }) => {
				const wc = browserManager.getWebContents(input.paneId);
				if (!wc) return { success: false };
				if (input.hard) {
					wc.reloadIgnoringCache();
				} else {
					wc.reload();
				}
				return { success: true };
			}),

		screenshot: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(async ({ input }) => {
				const base64 = await browserManager.screenshot(input.paneId);
				return { base64 };
			}),

		evaluateJS: publicProcedure
			.input(z.object({ paneId: z.string(), code: z.string() }))
			.mutation(async ({ input }) => {
				const result = await browserManager.evaluateJS(
					input.paneId,
					input.code,
				);
				return { result };
			}),

		getConsoleLogs: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.query(({ input }) => {
				return browserManager.getConsoleLogs(input.paneId);
			}),

		consoleStream: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<{
					level: string;
					message: string;
					timestamp: number;
				}>((emit) => {
					const handler = (entry: {
						level: string;
						message: string;
						timestamp: number;
					}) => {
						emit.next(entry);
					};
					browserManager.on(`console:${input.paneId}`, handler);
					return () => {
						browserManager.off(`console:${input.paneId}`, handler);
					};
				});
			}),

		onNewWindow: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<{ url: string }>((emit) => {
					const handler = (url: string) => {
						emit.next({ url });
					};
					browserManager.on(`new-window:${input.paneId}`, handler);
					return () => {
						browserManager.off(`new-window:${input.paneId}`, handler);
					};
				});
			}),

		onContextMenuAction: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<{ action: string; url: string }>((emit) => {
					const handler = (data: { action: string; url: string }) => {
						emit.next(data);
					};
					browserManager.on(`context-menu-action:${input.paneId}`, handler);
					return () => {
						browserManager.off(`context-menu-action:${input.paneId}`, handler);
					};
				});
			}),

		onClosePane: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<void>((emit) => {
					const handler = () => {
						emit.next();
					};
					browserManager.on(`close-pane:${input.paneId}`, handler);
					return () => {
						browserManager.off(`close-pane:${input.paneId}`, handler);
					};
				});
			}),

		onReloadPane: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<void>((emit) => {
					const handler = () => {
						emit.next();
					};
					browserManager.on(`reload-pane:${input.paneId}`, handler);
					return () => {
						browserManager.off(`reload-pane:${input.paneId}`, handler);
					};
				});
			}),

		openDevTools: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
				browserManager.openDevTools(input.paneId);
				return { success: true };
			}),

		getPageInfo: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.query(({ input }) => {
				const wc = browserManager.getWebContents(input.paneId);
				if (!wc) return null;
				return {
					url: wc.getURL(),
					title: wc.getTitle(),
					canGoBack: wc.canGoBack(),
					canGoForward: wc.canGoForward(),
					isLoading: wc.isLoading(),
				};
			}),

		setDevicePreset: publicProcedure
			.input(setDevicePresetInputSchema)
			.mutation(({ input }) => {
				const preset =
					input.presetId === "custom" && input.custom
						? createCustomPreset(input.custom)
						: resolveDevicePreset(input.presetId);
				browserManager.setDevicePreset(input.paneId, preset);
				return { preset };
			}),

		setDesignMode: publicProcedure
			.input(setDesignModeInputSchema)
			.mutation(async ({ input }) => {
				await designModeCaptureService.setDesignMode(
					input.paneId,
					input.enabled,
				);
				return { enabled: designModeCaptureService.isEnabled(input.paneId) };
			}),

		captureElement: publicProcedure
			.input(captureElementInputSchema)
			.mutation(async ({ input }) => {
				return designModeCaptureService.captureElement(input);
			}),

		getCapture: publicProcedure
			.input(getCaptureInputSchema)
			.query(({ input }) => {
				return designModeCaptureService.getCapture(input.captureId) ?? null;
			}),

		onDesignEvent: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<DesignModeEvent>((emit) => {
					return designModeCaptureService.onEvent(input.paneId, (event) => {
						emit.next(event);
					});
				});
			}),

		clearBrowsingData: publicProcedure
			.input(
				z.object({
					type: z.enum(["cookies", "cache", "storage", "all"]),
				}),
			)
			.mutation(async ({ input }) => {
				const ses = session.fromPartition("persist:rox");
				switch (input.type) {
					case "cookies":
						await ses.clearStorageData({ storages: ["cookies"] });
						break;
					case "cache":
						await ses.clearCache();
						break;
					case "storage":
						await ses.clearStorageData({
							storages: ["localstorage", "indexdb"],
						});
						break;
					case "all":
						await ses.clearStorageData();
						await ses.clearCache();
						break;
				}
				return { success: true };
			}),
	});
};
