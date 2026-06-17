import { observable } from "@trpc/server/observable";
import { env } from "main/env.main";
import {
	getHostServiceCoordinator,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
import {
	LOCAL_PLAYWRIGHT_SMOKE_AUTH_TOKEN,
	shouldBypassAuthForE2E,
} from "shared/e2e-auth-bypass";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";

const orgInput = z.object({ organizationId: z.string() });

function getLocalSmokeAuthToken(): string | null {
	if (
		shouldBypassAuthForE2E({
			nodeEnv: process.env.NODE_ENV,
			flag: process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS,
			scope: process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS_SCOPE,
		})
	) {
		return LOCAL_PLAYWRIGHT_SMOKE_AUTH_TOKEN;
	}
	return null;
}

export const createHostServiceCoordinatorRouter = () => {
	return router({
		start: publicProcedure.input(orgInput).mutation(async ({ input }) => {
			const coordinator = getHostServiceCoordinator();
			const { token } = await loadToken();
			const authToken = token ?? getLocalSmokeAuthToken();
			if (!authToken) {
				throw new Error("No auth token available — user must be logged in");
			}
			return coordinator.start(input.organizationId, {
				authToken,
				cloudApiUrl: env.NEXT_PUBLIC_API_URL,
			});
		}),

		getConnection: publicProcedure.input(orgInput).query(({ input }) => {
			const coordinator = getHostServiceCoordinator();
			return coordinator.getConnection(input.organizationId);
		}),

		getProcessStatus: publicProcedure.input(orgInput).query(({ input }) => {
			const coordinator = getHostServiceCoordinator();
			return { status: coordinator.getProcessStatus(input.organizationId) };
		}),

		restart: publicProcedure.input(orgInput).mutation(async ({ input }) => {
			const coordinator = getHostServiceCoordinator();
			const { token } = await loadToken();
			const authToken = token ?? getLocalSmokeAuthToken();
			if (!authToken) {
				throw new Error("No auth token available — user must be logged in");
			}
			return coordinator.restart(input.organizationId, {
				authToken,
				cloudApiUrl: env.NEXT_PUBLIC_API_URL,
			});
		}),

		reset: publicProcedure.input(orgInput).mutation(async ({ input }) => {
			const coordinator = getHostServiceCoordinator();
			const { token } = await loadToken();
			const authToken = token ?? getLocalSmokeAuthToken();
			if (!authToken) {
				throw new Error("No auth token available — user must be logged in");
			}
			return coordinator.reset(input.organizationId, {
				authToken,
				cloudApiUrl: env.NEXT_PUBLIC_API_URL,
			});
		}),

		onStatusChange: publicProcedure.subscription(() => {
			return observable<HostServiceStatusEvent>((emit) => {
				const coordinator = getHostServiceCoordinator();
				const handler = (event: HostServiceStatusEvent) => emit.next(event);
				coordinator.on("status-changed", handler);
				return () => coordinator.off("status-changed", handler);
			});
		}),
	});
};
