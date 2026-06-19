import { z } from "zod";
import { publicProcedure, router } from "..";
import {
	getAutomationTargets,
	getPermissionStatus,
	openAutomationSettings,
	requestAccessibility,
	requestAppleEvents,
	requestAutomation,
	requestFullDiskAccess,
	requestLocalNetwork,
	requestMicrophone,
	requestScreenRecording,
} from "./permissions/native-permissions";

export const createPermissionsRouter = () => {
	return router({
		getStatus: publicProcedure.query(() => {
			return getPermissionStatus();
		}),

		getAutomationTargets: publicProcedure.query(() => {
			return getAutomationTargets();
		}),

		requestFullDiskAccess: publicProcedure.mutation(async () => {
			await requestFullDiskAccess();
		}),

		requestAccessibility: publicProcedure.mutation(async () => {
			await requestAccessibility();
		}),

		requestMicrophone: publicProcedure.mutation(async () => {
			return requestMicrophone();
		}),

		requestScreenRecording: publicProcedure.mutation(async () => {
			await requestScreenRecording();
		}),

		/** Request Automation access for every known target (queued dialogs). */
		requestAppleEvents: publicProcedure.mutation(async () => {
			return requestAppleEvents();
		}),

		/** Request Automation access for a single target by bundle id. */
		requestAutomation: publicProcedure
			.input(z.object({ bundleId: z.string().min(1) }))
			.mutation(async ({ input }) => {
				return requestAutomation(input.bundleId);
			}),

		/** Open the Automation settings pane (no event sent). */
		openAutomationSettings: publicProcedure.mutation(async () => {
			await openAutomationSettings();
		}),

		requestLocalNetwork: publicProcedure.mutation(async () => {
			await requestLocalNetwork();
		}),
	});
};

export type PermissionsRouter = ReturnType<typeof createPermissionsRouter>;
