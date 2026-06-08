import type { TRPCRouterRecord } from "@trpc/server";
import { createProviderConnectionRouter } from "../shared/provider-router";

export const notionRouter = createProviderConnectionRouter(
	"notion",
) satisfies TRPCRouterRecord;
