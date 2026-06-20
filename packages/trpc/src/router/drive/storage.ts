/**
 * Drive storage seam — guarded construction of the object-storage provider.
 *
 * Drive's primary store is Cloudflare R2 (DECISIONS.md DQ1). Credentials come
 * from env: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
 * `R2_SECRET_ACCESS_KEY`. In CI / local dev those secrets are frequently ABSENT,
 * so this module NEVER throws at import time and NEVER constructs a provider
 * eagerly: {@link getDriveStorage} returns `null` when creds are missing. The
 * router then surfaces a clean `PRECONDITION_FAILED` instead of crashing, and
 * unit tests inject a mocked {@link StorageProvider} via {@link setDriveStorageForTest}.
 *
 * The key scheme is content-addressed per DQ1: `u/<userId>/<sha256>` — per-user
 * dedup, stable across handle renames (the key uses the immutable user UUID).
 */

import {
	createStorageProviderFromEnv,
	type StorageEnv,
	type StorageProvider,
} from "@rox/storage";

/** Content-addressed object key for a user's file (DQ1). */
export function driveStorageKey(userId: string, sha256: string): string {
	return `u/${userId}/${sha256}`;
}

/**
 * Env shape Drive reads. These are the R2_* names the deploy provides; the
 * underlying `@rox/storage` factory expects `STORAGE_*`, so {@link toStorageEnv}
 * translates. All optional so the module compiles + unit-tests without secrets.
 */
export interface DriveStorageEnv {
	R2_ACCOUNT_ID?: string;
	R2_BUCKET?: string;
	R2_ACCESS_KEY_ID?: string;
	R2_SECRET_ACCESS_KEY?: string;
	R2_ENDPOINT?: string;
}

function readEnv(): DriveStorageEnv {
	const env = (globalThis as { process?: { env?: Record<string, string> } })
		.process?.env;
	return {
		R2_ACCOUNT_ID: env?.R2_ACCOUNT_ID,
		R2_BUCKET: env?.R2_BUCKET,
		R2_ACCESS_KEY_ID: env?.R2_ACCESS_KEY_ID,
		R2_SECRET_ACCESS_KEY: env?.R2_SECRET_ACCESS_KEY,
		R2_ENDPOINT: env?.R2_ENDPOINT,
	};
}

/** True only when every credential R2 needs is present. */
export function hasDriveStorageCreds(
	env: DriveStorageEnv = readEnv(),
): boolean {
	return Boolean(
		env.R2_ACCOUNT_ID &&
			env.R2_BUCKET &&
			env.R2_ACCESS_KEY_ID &&
			env.R2_SECRET_ACCESS_KEY,
	);
}

/** Map the R2_* env onto the `@rox/storage` `StorageEnv` (r2 backend). */
function toStorageEnv(env: DriveStorageEnv): StorageEnv {
	return {
		STORAGE_PROVIDER: "r2",
		STORAGE_BUCKET: env.R2_BUCKET,
		STORAGE_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
		STORAGE_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
		R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
		...(env.R2_ENDPOINT ? { STORAGE_ENDPOINT: env.R2_ENDPOINT } : {}),
	};
}

// Lazily-constructed singleton + a test override seam.
let cached: StorageProvider | null | undefined;
let testOverride: StorageProvider | null | undefined;

/**
 * Inject a mocked provider for unit tests. Pass `null` to simulate a deploy
 * with no R2 credentials. Pass `undefined` to clear the override.
 */
export function setDriveStorageForTest(
	provider: StorageProvider | null | undefined,
): void {
	testOverride = provider;
	cached = undefined;
}

/**
 * Resolve the Drive {@link StorageProvider}, or `null` when R2 creds are absent
 * (CI/dev). Construction is lazy and memoized; a thrown factory error (bad
 * config) degrades to `null` rather than crashing the router.
 */
export function getDriveStorage(): StorageProvider | null {
	if (testOverride !== undefined) return testOverride;
	if (cached !== undefined) return cached;

	const env = readEnv();
	if (!hasDriveStorageCreds(env)) {
		cached = null;
		return cached;
	}
	try {
		cached = createStorageProviderFromEnv(toStorageEnv(env));
	} catch {
		cached = null;
	}
	return cached;
}
