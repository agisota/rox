import {
	orgSettingsPatchSchema,
	userPreferencesPatchSchema,
} from "@rox/shared/prefs";
import { z } from "zod";

/**
 * Zod inputs for the cross-device preferences router (F46, Hermes-borrow #643).
 *
 * The patch schemas come straight from the shared core (`@rox/shared/prefs`) so
 * the wire contract is the same shape db/trpc/clients all agree on. A client
 * sends a partial patch plus the epoch-millis `updatedAt` it stamped the change
 * with on-device; the server uses that timestamp for per-field LWW reconcile
 * (so an offline edge device that reconnects later cannot clobber a newer field
 * written elsewhere).
 */

const updatedAtSchema = z.number().int().min(0);

export const updateUserPreferencesSchema = z.object({
	patch: userPreferencesPatchSchema,
	/** Epoch-millis timestamp the client stamped this patch with (LWW). */
	updatedAt: updatedAtSchema,
});
export type UpdateUserPreferencesInput = z.infer<
	typeof updateUserPreferencesSchema
>;

export const updateOrgSettingsSchema = z.object({
	patch: orgSettingsPatchSchema,
	updatedAt: updatedAtSchema,
});
export type UpdateOrgSettingsInput = z.infer<typeof updateOrgSettingsSchema>;
