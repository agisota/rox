import { db } from "@rox/db/client";
import { integrationConnections } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { discordRouter } from "./discord";
import { fiberyRouter } from "./fibery";
import { githubRouter } from "./github";
import { larkRouter } from "./lark";
import { linearRouter } from "./linear";
import { notionRouter } from "./notion";
import { obsidianRouter } from "./obsidian";
import { slackRouter } from "./slack";
import { telegramRouter } from "./telegram";
import { verifyOrgMembership } from "./utils";

export const integrationRouter = {
	github: githubRouter,
	linear: linearRouter,
	slack: slackRouter,
	telegram: telegramRouter,
	discord: discordRouter,
	notion: notionRouter,
	obsidian: obsidianRouter,
	fibery: fiberyRouter,
	lark: larkRouter,

	list: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			return db.query.integrationConnections.findMany({
				where: eq(integrationConnections.organizationId, input.organizationId),
				columns: {
					id: true,
					provider: true,
					externalOrgId: true,
					externalOrgName: true,
					config: true,
					createdAt: true,
					updatedAt: true,
				},
			});
		}),
} satisfies TRPCRouterRecord;
