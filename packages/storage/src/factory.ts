import type { StorageConfig } from "./config";
import { resolveStorageConfig, type StorageEnv } from "./config";
import type { StorageProvider } from "./driver";
import { MinioProvider } from "./minio-provider";
import { R2Provider } from "./r2-provider";

/**
 * Construct the concrete {@link StorageProvider} for a resolved
 * {@link StorageConfig}. The `config.kind` discriminant selects the backend.
 */
export function createStorageProvider(config: StorageConfig): StorageProvider {
	switch (config.kind) {
		case "r2":
			return new R2Provider(config);
		case "minio":
			return new MinioProvider(config);
		default: {
			// Exhaustiveness guard: if a new kind is added to StorageConfig and
			// not handled above, TypeScript flags this branch at compile time.
			const _exhaustive: never = config;
			throw new Error(
				`[@rox/storage] unsupported storage kind: ${JSON.stringify(_exhaustive)}`,
			);
		}
	}
}

/**
 * Convenience wrapper: resolve config from environment variables and build the
 * matching provider in one call.
 */
export function createStorageProviderFromEnv(env: StorageEnv): StorageProvider {
	return createStorageProvider(resolveStorageConfig(env));
}
