import type { TRPCRouterRecord } from "@trpc/server";
import { createProviderConnectionRouter } from "../shared/provider-router";

export const telegramRouter = createProviderConnectionRouter(
	"telegram",
) satisfies TRPCRouterRecord;
