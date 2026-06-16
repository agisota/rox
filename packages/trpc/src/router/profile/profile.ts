import { db } from "@rox/db/client";
import { userProfiles } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../../trpc";
import {
	getProfileAggregateStats,
	getProfileHeatmap,
	HEATMAP_DAYS,
} from "./stats";

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
	location: z.string().max(120).nullish(),
	websiteUrl: z.string().url().max(2_000).nullish(),
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

	/**
	 * Public profile by nickname (`handle`) with top-level aggregate stats and a
	 * GitHub-contributions-style activity heatmap. Returns `null` for unknown or
	 * private profiles (unless the viewer is the owner).
	 */
	publicProfile: publicProcedure
		.input(z.object({ handle: handleSchema }))
		.query(async ({ ctx, input }) => {
			const profile = await db.query.userProfiles.findFirst({
				where: eq(userProfiles.handle, input.handle),
				with: { user: { columns: { name: true, image: true } } },
			});

			if (!profile) return null;

			const isOwner = profile.userId === ctx.session?.user.id;
			if (!profile.isPublic && !isOwner) return null;

			const [stats, heatmap] = await Promise.all([
				getProfileAggregateStats(profile.userId),
				getProfileHeatmap(profile.userId),
			]);

			return {
				profile: {
					userId: profile.userId,
					handle: profile.handle,
					displayName: profile.displayName ?? profile.user.name,
					bio: profile.bio,
					avatarUrl: profile.avatarUrl ?? profile.user.image,
					location: profile.location,
					websiteUrl: profile.websiteUrl,
					isPublic: profile.isPublic,
				},
				stats,
				heatmap,
				isOwner,
			};
		}),

	/** Owner-only aggregate stats + heatmap (visible before going public). */
	myStats: protectedProcedure.query(async ({ ctx }) => {
		const [stats, heatmap] = await Promise.all([
			getProfileAggregateStats(ctx.session.user.id),
			getProfileHeatmap(ctx.session.user.id),
		]);
		return { stats, heatmap, heatmapDays: HEATMAP_DAYS };
	}),

	update: protectedProcedure
		.input(profileInputSchema)
		.mutation(async ({ ctx, input }) => {
			const values = {
				handle: input.handle,
				displayName: input.displayName ?? null,
				bio: input.bio ?? null,
				avatarUrl: input.avatarUrl ?? null,
				isPublic: input.isPublic ?? false,
				location: input.location ?? null,
				websiteUrl: input.websiteUrl ?? null,
				contactEmail: input.contactEmail ?? null,
				telegram: input.telegram ?? null,
				max: input.max ?? null,
				wechat: input.wechat ?? null,
				twitter: input.twitter ?? null,
			};

			const [profile] = await db
				.insert(userProfiles)
				.values({ userId: ctx.session.user.id, ...values })
				.onConflictDoUpdate({
					target: userProfiles.userId,
					set: values,
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
