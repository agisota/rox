import { randomBytes } from "node:crypto";

import { auth } from "@rox/auth/server";
import { db } from "@rox/db/client";
import { sessions, users } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";

import { env } from "../../env";
import { adminProcedure } from "../../trpc";
import {
	banUserSchema,
	createUserSchema,
	updateUserSchema,
	userIdSchema,
} from "./schema";

/** Generate a strong, URL-safe temporary password (>= 8 chars). */
function generateTempPassword(): string {
	return `Rox-${randomBytes(12).toString("base64url")}`;
}

export const adminUsersRouter = {
	listUsers: adminProcedure.query(() => {
		return db.query.users.findMany({
			orderBy: desc(users.createdAt),
			columns: {
				id: true,
				name: true,
				email: true,
				image: true,
				role: true,
				banned: true,
				banReason: true,
				banExpiresAt: true,
				emailVerified: true,
				createdAt: true,
			},
		});
	}),

	createUser: adminProcedure
		.input(createUserSchema)
		.mutation(async ({ input }) => {
			const existing = await db.query.users.findFirst({
				where: eq(users.email, input.email),
				columns: { id: true },
			});
			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "A user with that email already exists.",
				});
			}

			const password = input.password ?? generateTempPassword();
			const generated = !input.password;

			// Create the auth.users row + credentials through Better Auth so the
			// password is hashed and an `accounts` row is provisioned. The
			// user.create databaseHook auto-enrolls the user into an organization.
			await auth.api.signUpEmail({
				body: { email: input.email, name: input.name, password },
			});

			const created = await db.query.users.findFirst({
				where: eq(users.email, input.email),
				columns: { id: true },
			});
			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "User creation failed.",
				});
			}

			// Admin-created accounts are pre-verified so the user can sign in with
			// the issued credentials immediately.
			await db
				.update(users)
				.set({ role: input.role, emailVerified: true })
				.where(eq(users.id, created.id));

			return {
				userId: created.id,
				// Only surfaced when we generated it — lets the admin relay
				// credentials to the new user.
				temporaryPassword: generated ? password : null,
			};
		}),

	updateUser: adminProcedure
		.input(updateUserSchema)
		.mutation(async ({ input }) => {
			const updates: Partial<typeof users.$inferInsert> = {};
			if (input.name !== undefined) updates.name = input.name;
			if (input.role !== undefined) updates.role = input.role;
			if (input.status !== undefined) {
				updates.banned = input.status !== "active";
				if (input.status === "active") {
					updates.banReason = null;
					updates.banExpiresAt = null;
				}
			}

			if (Object.keys(updates).length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No fields to update.",
				});
			}

			await db.update(users).set(updates).where(eq(users.id, input.userId));

			// Banning/suspending kills active sessions so access is revoked now.
			if (updates.banned === true) {
				await db.delete(sessions).where(eq(sessions.userId, input.userId));
			}

			return { success: true };
		}),

	banUser: adminProcedure.input(banUserSchema).mutation(async ({ input }) => {
		await db
			.update(users)
			.set({
				banned: true,
				banReason: input.reason ?? null,
				banExpiresAt: input.expiresAt ?? null,
			})
			.where(eq(users.id, input.userId));

		// Revoke all sessions immediately on ban/suspend.
		await db.delete(sessions).where(eq(sessions.userId, input.userId));

		return { success: true };
	}),

	reactivateUser: adminProcedure
		.input(userIdSchema)
		.mutation(async ({ input }) => {
			await db
				.update(users)
				.set({ banned: false, banReason: null, banExpiresAt: null })
				.where(eq(users.id, input.userId));
			return { success: true };
		}),

	deleteUser: adminProcedure.input(userIdSchema).mutation(async ({ input }) => {
		// Delete user - Better Auth handles cascading session cleanup
		await db.delete(users).where(eq(users.id, input.userId));
		return { success: true };
	}),

	/**
	 * Impersonate a user: provision a fresh session for the target, tagged with
	 * the acting admin's id, and return a bearer token. Better Auth resolves
	 * sessions by token, so the returned token authenticates as the target user.
	 */
	impersonateUser: adminProcedure
		.input(userIdSchema)
		.mutation(async ({ ctx, input }) => {
			const target = await db.query.users.findFirst({
				where: eq(users.id, input.userId),
				columns: { id: true },
			});
			if (!target) {
				throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
			}

			const token = randomBytes(32).toString("base64url");
			// 1-hour impersonation window.
			const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

			const [created] = await db
				.insert(sessions)
				.values({
					token,
					userId: target.id,
					expiresAt,
					impersonatedBy: ctx.session.user.id,
				})
				.returning({ id: sessions.id, token: sessions.token });

			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to start impersonation session.",
				});
			}

			return {
				token: created.token,
				expiresAt,
				webUrl: env.NEXT_PUBLIC_WEB_URL,
			};
		}),
} satisfies TRPCRouterRecord;
