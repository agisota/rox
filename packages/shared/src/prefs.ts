/**
 * Cross-device preferences sync — shared core (F46, Hermes-borrow #643).
 *
 * This is the single, platform-agnostic core for the portable user/org
 * preferences document. The Drizzle tables (`user_preferences`, `org_settings`
 * in `@rox/db`), the tRPC mutations (`@rox/trpc` `prefs` router), and every
 * client collection (desktop / mobile / web Electric collections) all consume
 * THESE schemas and THIS merge function — there is no per-platform copy of the
 * prefs shape or conflict logic.
 *
 * Why it lives in `@rox/shared` (and stays serializable): the prefs document is
 * the connective tissue that makes "a pin on desktop = a pin on phone" true. To
 * keep that invariant the same everywhere, the value types are plain JSON
 * (string / number / boolean / arrays / records — no Date, no class instances)
 * so they round-trip through Electric, IndexedDB, SQLite, and AsyncStorage
 * identically.
 *
 * Conflict handling is **last-write-wins per field**: each writable field has a
 * sibling `*_updated_at` epoch-millis timestamp. `mergePreferencesLWW` compares
 * the per-field timestamps of two snapshots and keeps the newer value for each
 * field independently, so two devices editing *different* fields offline both
 * survive a reconcile, and two devices editing the *same* field deterministically
 * resolve to the later timestamp.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Field value schemas (serializable — JSON only)
// ---------------------------------------------------------------------------

/** A pinned object reference (F19). `kind` is the object family, `id` its uuid. */
export const pinnedItemSchema = z.object({
	kind: z.string().min(1).max(64),
	id: z.string().min(1).max(128),
	position: z.number().int().min(0).default(0),
});
export type PinnedItem = z.infer<typeof pinnedItemSchema>;

/** Saved view / filter preset (F17). `config` is an opaque serializable blob. */
export const savedViewSchema = z.object({
	id: z.string().min(1).max(128),
	name: z.string().min(1).max(200),
	scope: z.string().min(1).max(64),
	config: z.record(z.string(), z.unknown()).default({}),
	position: z.number().int().min(0).default(0),
});
export type SavedView = z.infer<typeof savedViewSchema>;

/** Per-key tag/label display preference (F10/F11/F17): order + visibility. */
export const tagPrefSchema = z.object({
	id: z.string().min(1).max(128),
	hidden: z.boolean().default(false),
	position: z.number().int().min(0).default(0),
});
export type TagPref = z.infer<typeof tagPrefSchema>;

/**
 * Disclosure / collapse state (F18/F40): map of opaque section key → expanded.
 * A missing key falls back to the surface's own default, so this only carries
 * explicit user overrides.
 */
export const disclosureStateSchema = z.record(z.string(), z.boolean());
export type DisclosureState = z.infer<typeof disclosureStateSchema>;

/** BCP-47-ish locale tag (F58 backing). Empty string = follow system. */
export const localeSchema = z.string().max(35);

// ---------------------------------------------------------------------------
// Per-field LWW timestamps
// ---------------------------------------------------------------------------

/**
 * The set of independently-mergeable preference fields. Each is paired with a
 * `<field>UpdatedAt` epoch-millis timestamp for last-write-wins reconcile.
 */
export const PREFERENCE_FIELDS = [
	"pins",
	"tagPrefs",
	"savedViews",
	"disclosure",
	"locale",
	"rightPanelPeek",
] as const;
export type PreferenceField = (typeof PREFERENCE_FIELDS)[number];

/** Epoch-millis timestamp; non-negative integer so it sorts as a number. */
const fieldTimestampSchema = z.number().int().min(0).default(0);

const preferenceTimestampsSchema = z.object({
	pinsUpdatedAt: fieldTimestampSchema,
	tagPrefsUpdatedAt: fieldTimestampSchema,
	savedViewsUpdatedAt: fieldTimestampSchema,
	disclosureUpdatedAt: fieldTimestampSchema,
	localeUpdatedAt: fieldTimestampSchema,
	rightPanelPeekUpdatedAt: fieldTimestampSchema,
});

// ---------------------------------------------------------------------------
// User preferences document
// ---------------------------------------------------------------------------

/**
 * The portable per-(org, user) preferences document. Every field is optional on
 * input (partial patches) but the stored snapshot always carries a full default
 * via `userPreferencesDocSchema.parse({})`.
 */
export const userPreferencesValuesSchema = z.object({
	/** Pinned objects, ordered (F19). */
	pins: z.array(pinnedItemSchema).default([]),
	/** Per-tag display prefs (F10/F11/F17). */
	tagPrefs: z.array(tagPrefSchema).default([]),
	/** Saved views / filter presets (F17). */
	savedViews: z.array(savedViewSchema).default([]),
	/** Disclosure/collapse overrides (F18/F40). */
	disclosure: disclosureStateSchema.default({}),
	/** UI locale (F58). */
	locale: localeSchema.default(""),
	/** Right-panel peek/expanded preference (F03). */
	rightPanelPeek: z.boolean().default(false),
});
export type UserPreferencesValues = z.infer<typeof userPreferencesValuesSchema>;

/** Full snapshot = values + per-field timestamps. */
export const userPreferencesDocSchema = userPreferencesValuesSchema.merge(
	preferenceTimestampsSchema,
);
export type UserPreferencesDoc = z.infer<typeof userPreferencesDocSchema>;

/** A partial patch a client sends; only present fields are touched. */
export const userPreferencesPatchSchema = userPreferencesValuesSchema.partial();
export type UserPreferencesPatch = z.infer<typeof userPreferencesPatchSchema>;

/** Default empty document (all fields at their zero value, timestamps 0). */
export function emptyUserPreferencesDoc(): UserPreferencesDoc {
	return userPreferencesDocSchema.parse({});
}

// ---------------------------------------------------------------------------
// Org settings document
// ---------------------------------------------------------------------------

/**
 * Org-wide settings document (per organization). Mirrors the user document
 * shape (values + per-field LWW timestamps) but holds org-default fields rather
 * than per-user prefs. Kept intentionally small; new org-scoped settings get a
 * field + a sibling timestamp here.
 */
export const orgSettingsValuesSchema = z.object({
	/** Org default locale used as the fallback when a user has none (F58). */
	defaultLocale: localeSchema.default(""),
	/** Org default tag/label display prefs applied before per-user overrides. */
	defaultTagPrefs: z.array(tagPrefSchema).default([]),
	/** Org-shared saved views every member sees (F17). */
	sharedViews: z.array(savedViewSchema).default([]),
});
export type OrgSettingsValues = z.infer<typeof orgSettingsValuesSchema>;

const orgSettingsTimestampsSchema = z.object({
	defaultLocaleUpdatedAt: fieldTimestampSchema,
	defaultTagPrefsUpdatedAt: fieldTimestampSchema,
	sharedViewsUpdatedAt: fieldTimestampSchema,
});

export const orgSettingsDocSchema = orgSettingsValuesSchema.merge(
	orgSettingsTimestampsSchema,
);
export type OrgSettingsDoc = z.infer<typeof orgSettingsDocSchema>;

export const orgSettingsPatchSchema = orgSettingsValuesSchema.partial();
export type OrgSettingsPatch = z.infer<typeof orgSettingsPatchSchema>;

export function emptyOrgSettingsDoc(): OrgSettingsDoc {
	return orgSettingsDocSchema.parse({});
}

// ---------------------------------------------------------------------------
// Last-write-wins merge
// ---------------------------------------------------------------------------

/** Map a values-field name to its sibling `*UpdatedAt` timestamp key. */
function timestampKey<T extends string>(field: T): `${T}UpdatedAt` {
	return `${field}UpdatedAt`;
}

/**
 * Generic per-field LWW merge for a snapshot made of value fields plus matching
 * `<field>UpdatedAt` timestamps. For each value field, the snapshot with the
 * strictly newer timestamp wins; ties keep `base` (the local/current snapshot)
 * so reconcile is stable and idempotent.
 */
function mergeLWW<TValues extends Record<string, unknown>>(
	valueFields: readonly (keyof TValues & string)[],
	base: TValues & Record<string, unknown>,
	incoming: TValues & Record<string, unknown>,
): TValues & Record<string, unknown> {
	const result: Record<string, unknown> = { ...base };
	for (const field of valueFields) {
		const tsField = timestampKey(field);
		const baseTs = (base[tsField] as number | undefined) ?? 0;
		const incomingTs = (incoming[tsField] as number | undefined) ?? 0;
		if (incomingTs > baseTs) {
			result[field] = incoming[field];
			result[tsField] = incomingTs;
		}
	}
	return result as TValues & Record<string, unknown>;
}

/**
 * Merge two user-preference snapshots field-by-field via LWW. Used both on the
 * client (reconcile a queued offline patch against the synced server row) and on
 * the server (apply an incoming patch's timestamps over the stored row).
 */
export function mergePreferencesLWW(
	base: UserPreferencesDoc,
	incoming: UserPreferencesDoc,
): UserPreferencesDoc {
	return mergeLWW(
		userPreferencesValuesSchema.keyof().options as PreferenceField[],
		base,
		incoming,
	) as UserPreferencesDoc;
}

/** Merge two org-settings snapshots field-by-field via LWW. */
export function mergeOrgSettingsLWW(
	base: OrgSettingsDoc,
	incoming: OrgSettingsDoc,
): OrgSettingsDoc {
	return mergeLWW(
		orgSettingsValuesSchema.keyof().options as (keyof OrgSettingsValues &
			string)[],
		base,
		incoming,
	) as OrgSettingsDoc;
}

/**
 * Stamp a partial user-prefs patch into a full document at timestamp `now`
 * (epoch millis). Only the fields present in `patch` are written, and only their
 * sibling timestamps are advanced — untouched fields (and their timestamps) are
 * carried over from `base`. This is what a writer (server mutation or optimistic
 * client write) calls before persisting, so every changed field carries the
 * timestamp the LWW merge later compares.
 */
export function applyUserPreferencesPatch(
	base: UserPreferencesDoc,
	patch: UserPreferencesPatch,
	now: number,
): UserPreferencesDoc {
	const next: UserPreferencesDoc = { ...base };
	for (const field of PREFERENCE_FIELDS) {
		if (patch[field] !== undefined) {
			// biome-ignore lint/suspicious/noExplicitAny: heterogeneous field write guarded by key set.
			(next as any)[field] = patch[field];
			// biome-ignore lint/suspicious/noExplicitAny: matching timestamp key write.
			(next as any)[timestampKey(field)] = now;
		}
	}
	return next;
}

/**
 * Extract a clean user-prefs patch (only the known value fields) from an opaque
 * `values` change blob a client collection produces when the row's jsonb is
 * mutated. Unknown/timestamp keys are dropped so only real field edits are sent
 * over the wire. Shared so desktop and mobile derive the patch identically.
 */
export function pickUserPreferencesPatch(
	values: unknown,
): UserPreferencesPatch {
	if (!values || typeof values !== "object") return {};
	const source = values as Record<string, unknown>;
	const patch: Record<string, unknown> = {};
	for (const field of PREFERENCE_FIELDS) {
		if (source[field] !== undefined) patch[field] = source[field];
	}
	return userPreferencesPatchSchema.parse(patch);
}

/** Extract a clean org-settings patch from an opaque `values` change blob. */
export function pickOrgSettingsPatch(values: unknown): OrgSettingsPatch {
	if (!values || typeof values !== "object") return {};
	const source = values as Record<string, unknown>;
	const patch: Record<string, unknown> = {};
	for (const field of orgSettingsValuesSchema.keyof().options) {
		if (source[field] !== undefined) patch[field] = source[field];
	}
	return orgSettingsPatchSchema.parse(patch);
}

/** Stamp a partial org-settings patch into a full document at timestamp `now`. */
export function applyOrgSettingsPatch(
	base: OrgSettingsDoc,
	patch: OrgSettingsPatch,
	now: number,
): OrgSettingsDoc {
	const next: OrgSettingsDoc = { ...base };
	for (const field of orgSettingsValuesSchema.keyof().options) {
		if (patch[field] !== undefined) {
			// biome-ignore lint/suspicious/noExplicitAny: heterogeneous field write guarded by key set.
			(next as any)[field] = patch[field];
			// biome-ignore lint/suspicious/noExplicitAny: matching timestamp key write.
			(next as any)[timestampKey(field)] = now;
		}
	}
	return next;
}
