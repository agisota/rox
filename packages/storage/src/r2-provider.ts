import { S3Client } from "@aws-sdk/client-s3";
import type { R2Config } from "./config";
import {
	type PresignerFn,
	S3BaseProvider,
	type S3BaseProviderOptions,
} from "./s3-base";

/** Default R2 region label. R2 ignores region but the SDK requires one. */
const R2_DEFAULT_REGION = "auto";

/** Derive the S3 API endpoint for a Cloudflare R2 account. */
export function r2Endpoint(config: R2Config): string {
	return (
		config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`
	);
}

/**
 * Build an {@link S3Client} pointed at Cloudflare R2 from an {@link R2Config}.
 */
export function createR2Client(config: R2Config): S3Client {
	return new S3Client({
		region: config.region ?? R2_DEFAULT_REGION,
		endpoint: r2Endpoint(config),
		credentials: {
			accessKeyId: config.credentials.accessKeyId,
			secretAccessKey: config.credentials.secretAccessKey,
			...(config.credentials.sessionToken
				? { sessionToken: config.credentials.sessionToken }
				: {}),
		},
	});
}

/** Options accepted by {@link R2Provider} for test injection. */
export interface R2ProviderOptions {
	/** Pre-built client (mocked in tests). Defaults to {@link createR2Client}. */
	client?: S3Client;
	/** Overridable presigner; forwarded to {@link S3BaseProvider}. */
	presigner?: PresignerFn;
}

/**
 * Cloudflare R2 storage provider — the suite's primary object store.
 *
 * All object operations are inherited from {@link S3BaseProvider}; this class
 * only wires up the R2-specific {@link S3Client}.
 */
export class R2Provider extends S3BaseProvider {
	constructor(config: R2Config, options: R2ProviderOptions = {}) {
		const base: S3BaseProviderOptions = {
			client: options.client ?? createR2Client(config),
			bucket: config.bucket,
			kind: "r2",
			...(options.presigner ? { presigner: options.presigner } : {}),
		};
		super(base);
	}
}
