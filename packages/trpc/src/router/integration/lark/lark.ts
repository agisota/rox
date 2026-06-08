import type { TRPCRouterRecord } from "@trpc/server";
import { createProviderConnectionRouter } from "../shared/provider-router";

export const larkRouter = createProviderConnectionRouter(
	"lark",
) satisfies TRPCRouterRecord;
