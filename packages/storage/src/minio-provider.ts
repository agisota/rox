import { S3Client } from "@aws-sdk/client-s3";
import type { MinioConfig } from "./config";
import {
	type PresignerFn,
	S3BaseProvider,
	type S3BaseProviderOptions,
} from "./s3-base";

/** Default region label used when a MinIO config omits one. */
const MINIO_DEFAULT_REGION = "us-east-1";

/**
 * Build an {@link S3Client} pointed at a self-hosted MinIO from a
 * {@link MinioConfig}. Path-style addressing is enabled by default since MinIO
 * typically does not support virtual-host bucket addressing.
 */
export function createMinioClient(config: MinioConfig): S3Client {
	return new S3Client({
		region: config.region ?? MINIO_DEFAULT_REGION,
		endpoint: config.endpoint,
		forcePathStyle: config.forcePathStyle ?? true,
		credentials: {
			accessKeyId: config.credentials.accessKeyId,
			secretAccessKey: config.credentials.secretAccessKey,
			...(config.credentials.sessionToken
				? { sessionToken: config.credentials.sessionToken }
				: {}),
		},
	});
}

/** Options accepted by {@link MinioProvider} for test injection. */
export interface MinioProviderOptions {
	/**
	 * Pre-built client (mocked in tests). Defaults to {@link createMinioClient}.
	 */
	client?: S3Client;
	/** Overridable presigner; forwarded to {@link S3BaseProvider}. */
	presigner?: PresignerFn;
}

/**
 * MinIO storage provider — the suite's secondary / self-hosted object store.
 *
 * All object operations are inherited from {@link S3BaseProvider}; this class
 * only wires up the MinIO-specific {@link S3Client}.
 */
export class MinioProvider extends S3BaseProvider {
	constructor(config: MinioConfig, options: MinioProviderOptions = {}) {
		const base: S3BaseProviderOptions = {
			client: options.client ?? createMinioClient(config),
			bucket: config.bucket,
			kind: "minio",
			...(options.presigner ? { presigner: options.presigner } : {}),
		};
		super(base);
	}
}
