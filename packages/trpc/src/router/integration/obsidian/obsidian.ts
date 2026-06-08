import type { TRPCRouterRecord } from "@trpc/server";
import { createProviderConnectionRouter } from "../shared/provider-router";

export const obsidianRouter = createProviderConnectionRouter(
	"obsidian",
) satisfies TRPCRouterRecord;
