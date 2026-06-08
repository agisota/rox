import { z } from "zod";

export const userRoleSchema = z.enum(["user", "admin"]);

export const createUserSchema = z.object({
	email: z.string().email(),
	name: z.string().min(1).max(120),
	role: userRoleSchema.default("user"),
	/**
	 * Optional initial password. When omitted, a strong temporary password is
	 * generated and returned to the admin so they can share it out-of-band.
	 */
	password: z.string().min(8).max(128).optional(),
});

export const updateUserSchema = z.object({
	userId: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	role: userRoleSchema.optional(),
	/** Account status. `suspended` is a ban with no fixed expiry. */
	status: z.enum(["active", "banned", "suspended"]).optional(),
});

export const banUserSchema = z.object({
	userId: z.string().uuid(),
	reason: z.string().max(500).optional(),
	/** Optional expiry — when set, the ban is a temporary suspension. */
	expiresAt: z.date().optional(),
});

export const userIdSchema = z.object({ userId: z.string().uuid() });

export const createOrganizationSchema = z.object({
	name: z.string().min(1).max(120),
	slug: z
		.string()
		.min(1)
		.max(60)
		.regex(/^[a-z0-9-]+$/, "Slug may only contain a-z, 0-9 and dashes"),
});

export const renameOrganizationSchema = z.object({
	organizationId: z.string().uuid(),
	name: z.string().min(1).max(120),
});

export const organizationIdSchema = z.object({
	organizationId: z.string().uuid(),
});

export const addMemberSchema = z.object({
	organizationId: z.string().uuid(),
	userId: z.string().uuid(),
	role: z.enum(["owner", "admin", "member"]).default("member"),
});

export const removeMemberSchema = z.object({
	organizationId: z.string().uuid(),
	userId: z.string().uuid(),
});
