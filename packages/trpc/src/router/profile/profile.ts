import { db } from "@rox/db/client";
import { userProfiles } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../../trpc";

const handleSchema = z
	.string()
	.min(2)
	.max(40)
	.regex(/^[a-zA-Z0-9_-]+$/);

const profileInputSchema = z.object({
	handle: handleSchema,
	displayName: z.string().min(1).max(120).nullish(),
	bio: z.string().max(1_000).nullish(),
	avatarUrl: z.string().url().max(2_000).nullish(),
	isPublic: z.boolean().optional(),
	contactEmail: z.string().email().max(320).nullish(),
	telegram: z.string().max(120).nullish(),
	max: z.string().max(120).nullish(),
	wechat: z.string().max(120).nullish(),
	twitter: z.string().max(120).nullish(),
});

export const profileRouter = {
	getByHandle: publicProcedure
		.input(z.object({ handle: handleSchema }))
		.query(async ({ ctx, input }) => {
			const profile = await db.query.userProfiles.findFirst({
				where: eq(userProfiles.handle, input.handle),
			});

			if (!profile) return null;
			if (profile.isPublic || profile.userId === ctx.session?.user.id) {
				return profile;
			}

			return null;
		}),

	getMine: protectedProcedure.query(async ({ ctx }) => {
		return db.query.userProfiles.findFirst({
			where: eq(userProfiles.userId, ctx.session.user.id),
		});
	}),

	update: protectedProcedure
		.input(profileInputSchema)
		.mutation(async ({ ctx, input }) => {
			const [profile] = await db
				.insert(userProfiles)
				.values({
					userId: ctx.session.user.id,
					handle: input.handle,
					displayName: input.displayName ?? null,
					bio: input.bio ?? null,
					avatarUrl: input.avatarUrl ?? null,
					isPublic: input.isPublic ?? false,
					contactEmail: input.contactEmail ?? null,
					telegram: input.telegram ?? null,
					max: input.max ?? null,
					wechat: input.wechat ?? null,
					twitter: input.twitter ?? null,
				})
				.onConflictDoUpdate({
					target: userProfiles.userId,
					set: {
						handle: input.handle,
						displayName: input.displayName ?? null,
						bio: input.bio ?? null,
						avatarUrl: input.avatarUrl ?? null,
						isPublic: input.isPublic ?? false,
						contactEmail: input.contactEmail ?? null,
						telegram: input.telegram ?? null,
						max: input.max ?? null,
						wechat: input.wechat ?? null,
						twitter: input.twitter ?? null,
					},
				})
				.returning();

			if (!profile) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Не удалось сохранить профиль Rox.",
				});
			}

			return profile;
		}),
} satisfies TRPCRouterRecord;
