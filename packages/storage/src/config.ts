import type { StorageProviderKind } from "./types";

/** Credentials shared by all S3-compatible backends. */
export interface S3Credentials {
	accessKeyId: string;
	secretAccessKey: string;
	/** Optional session token (for temporary credentials). */
	sessionToken?: string;
}

/** Configuration for the Cloudflare R2 backend (primary store). */
export interface R2Config {
	kind: "r2";
	/** Cloudflare account id, used to derive the default endpoint. */
	accountId: string;
	/** Default bucket for operations that omit an explicit bucket. */
	bucket: string;
	credentials: S3Credentials;
	/**
	 * Optional explicit endpoint override. When omitted, it is derived as
	 * `https://<accountId>.r2.cloudflarestorage.com`.
	 */
	endpoint?: string;
	/** R2 ignores region; defaults to `auto`. */
	region?: string;
}

/** Configuration for a self-hosted MinIO backend (secondary store). */
export interface MinioConfig {
	kind: "minio";
	/** Full endpoint URL, e.g. `https://s3.example.t`. */
	endpoint: string;
	/** Default bucket for operations that omit an explicit bucket. */
	bucket: string;
	credentials: S3Credentials;
	/** Region label MinIO is configured with. Defaults to `us-east-1`. */
	region?: string;
	/**
	 * Use path-style addressing (`endpoint/bucket/key`) instead of virtual-host
	 * addressing. MinIO typically requires this; defaults to `true`.
	 */
	forcePathStyle?: boolean;
}

/** Discriminated union of every supported storage backend configuration. */
export type StorageConfig = R2Config | MinioConfig;

/** Environment variable shape consumed by {@link resolveStorageConfig}. */
export interface StorageEnv {
	STORAGE_PROVIDER?: string;
	STORAGE_BUCKET?: string;
	STORAGE_ACCESS_KEY_ID?: string;
	STORAGE_SECRET_ACCESS_KEY?: string;
	STORAGE_SESSION_TOKEN?: string;
	STORAGE_REGION?: string;
	/** R2 only. */
	R2_ACCOUNT_ID?: string;
	STORAGE_ENDPOINT?: string;
	/** MinIO only; `"false"` disables path-style addressing. */
	STORAGE_FORCE_PATH_STYLE?: string;
}

function requireEnv(value: string | undefined, name: string): string {
	if (!value) {
		throw new Error(`[@rox/storage] missing required env var: ${name}`);
	}
	return value;
}

function isProviderKind(value: string): value is StorageProviderKind {
	return value === "r2" || value === "minio";
}

/**
 * Build a {@link StorageConfig} from environment variables.
 *
 * `STORAGE_PROVIDER` selects the backend (`r2` | `minio`); the remaining vars
 * supply the per-backend settings. Throws with an explicit message when a
 * required variable is absent so misconfiguration fails fast at boot.
 */
export function resolveStorageConfig(env: StorageEnv): StorageConfig {
	const kind = (env.STORAGE_PROVIDER ?? "r2").trim();
	if (!isProviderKind(kind)) {
		throw new Error(
			`[@rox/storage] unsupported STORAGE_PROVIDER: "${kind}" (expected "r2" or "minio")`,
		);
	}

	const credentials: S3Credentials = {
		accessKeyId: requireEnv(env.STORAGE_ACCESS_KEY_ID, "STORAGE_ACCESS_KEY_ID"),
		secretAccessKey: requireEnv(
			env.STORAGE_SECRET_ACCESS_KEY,
			"STORAGE_SECRET_ACCESS_KEY",
		),
		...(env.STORAGE_SESSION_TOKEN
			? { sessionToken: env.STORAGE_SESSION_TOKEN }
			: {}),
	};

	const bucket = requireEnv(env.STORAGE_BUCKET, "STORAGE_BUCKET");

	if (kind === "r2") {
		return {
			kind: "r2",
			accountId: requireEnv(env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID"),
			bucket,
			credentials,
			...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
			...(env.STORAGE_REGION ? { region: env.STORAGE_REGION } : {}),
		};
	}

	return {
		kind: "minio",
		endpoint: requireEnv(env.STORAGE_ENDPOINT, "STORAGE_ENDPOINT"),
		bucket,
		credentials,
		...(env.STORAGE_REGION ? { region: env.STORAGE_REGION } : {}),
		forcePathStyle: env.STORAGE_FORCE_PATH_STYLE !== "false",
	};
}
