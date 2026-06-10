import { observable } from "@trpc/server/observable";
import { env } from "main/env.main";
import {
	getHostServiceCoordinator,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";

const orgInput = z.object({ organizationId: z.string() });

async function getHostServiceAuthToken(): Promise<string | null> {
	const { token } = await loadToken();
	return token ?? (env.LOCAL_ONLY_AUTH ? "local-only-auth-token" : null);
}

export const createHostServiceCoordinatorRouter = () => {
	return router({
		start: publicProcedure.input(orgInput).mutation(async ({ input }) => {
			const coordinator = getHostServiceCoordinator();
			const authToken = await getHostServiceAuthToken();
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
			const authToken = await getHostServiceAuthToken();
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
			const authToken = await getHostServiceAuthToken();
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
