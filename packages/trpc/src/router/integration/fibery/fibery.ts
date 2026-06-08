import type { TRPCRouterRecord } from "@trpc/server";
import { createProviderConnectionRouter } from "../shared/provider-router";

export const fiberyRouter = createProviderConnectionRouter(
	"fibery",
) satisfies TRPCRouterRecord;
