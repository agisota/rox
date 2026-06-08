import type { TRPCRouterRecord } from "@trpc/server";
import { createProviderConnectionRouter } from "../shared/provider-router";

export const discordRouter = createProviderConnectionRouter(
	"discord",
) satisfies TRPCRouterRecord;
