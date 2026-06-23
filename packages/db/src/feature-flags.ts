/**
 * Per-user feature-flag override helpers (WS-O §2.4 — the DB half).
 *
 * These own the DB side of the resolution contract WS-F imports:
 *   resolveUserFlag(...)        → boolean (forced) | null (inherit → PostHog)
 *   upsertUserFlagOverride(...) → value=null DELETEs the row (back to inherit);
 *                                 a boolean INSERTs/UPDATEs the forced value.
 *
 * The PostHog fallback (when resolveUserFlag returns null) lives in WS-F's read
 * layer, NOT here. Helpers accept an injectable `db` (defaulting to the shared
 * client) so they are unit-testable without a live connection.
 */

import { and, eq } from "drizzle-orm";
import { userFeatureFlags } from "./schema/feature-flags";

/**
 * Resolve the shared Drizzle client lazily so importing this module (and the
 * `@rox/db/utils` barrel that re-exports it) does NOT eagerly construct the Neon
 * connection — which would require `DATABASE_URL` and break unit tests that
 * inject a mock `db`. The client is only built when a helper is called with no
 * `db` argument.
 */
async function resolveDefaultDb(): Promise<FeatureFlagDb> {
	const { db } = await import("./client");
	return db as unknown as FeatureFlagDb;
}

/**
 * The slice of the Drizzle client these helpers use. Kept structural so callers
 * can inject a mock or a transaction. Methods are intentionally loose because
 * Drizzle's builder types vary by client (Neon, PostgresJs, …).
 */
export type FeatureFlagDb = {
	query: {
		userFeatureFlags: {
			// biome-ignore lint/suspicious/noExplicitAny: drizzle relational-query arg type varies by client
			findFirst: (args?: any) => Promise<{ value: boolean } | undefined | null>;
		};
	};
	// biome-ignore lint/suspicious/noExplicitAny: drizzle insert builder type varies by client
	insert: (table: typeof userFeatureFlags) => any;
	// biome-ignore lint/suspicious/noExplicitAny: drizzle delete builder type varies by client
	delete: (table: typeof userFeatureFlags) => any;
};

/**
 * Resolve a user's forced flag value from the DB override store.
 * @returns `true`/`false` when an override row exists; `null` when there is no
 *   row, meaning the caller should fall through to PostHog.
 */
export async function resolveUserFlag(
	{ userId, key }: { userId: string; key: string },
	db?: FeatureFlagDb,
): Promise<boolean | null> {
	const client = db ?? (await resolveDefaultDb());
	const row = await client.query.userFeatureFlags.findFirst({
		where: and(
			eq(userFeatureFlags.userId, userId),
			eq(userFeatureFlags.key, key),
		),
		columns: { value: true },
	});
	return row ? row.value : null;
}

/**
 * Force a flag ON/OFF for a user, or clear the override.
 * - `value: true | false` → INSERT … ON CONFLICT (user_id, key) DO UPDATE.
 * - `value: null`         → DELETE the row (the user inherits PostHog again).
 */
export async function upsertUserFlagOverride(
	{
		userId,
		key,
		value,
		updatedBy,
	}: {
		userId: string;
		key: string;
		value: boolean | null;
		updatedBy?: string | null;
	},
	db?: FeatureFlagDb,
): Promise<void> {
	const client = db ?? (await resolveDefaultDb());
	if (value === null) {
		await client
			.delete(userFeatureFlags)
			.where(
				and(eq(userFeatureFlags.userId, userId), eq(userFeatureFlags.key, key)),
			);
		return;
	}

	await client
		.insert(userFeatureFlags)
		.values({ userId, key, value, updatedBy: updatedBy ?? null })
		.onConflictDoUpdate({
			target: [userFeatureFlags.userId, userFeatureFlags.key],
			set: { value, updatedBy: updatedBy ?? null },
		});
}
