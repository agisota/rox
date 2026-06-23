import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageDriver } from "./driver";
import {
	type CopyParams,
	DEFAULT_PRESIGN_EXPIRES_IN,
	type HeadResult,
	type ListParams,
	type ListResult,
	type ObjectRef,
	type PresignGetParams,
	type PresignPutParams,
	type PresignResult,
	type StorageProviderKind,
} from "./types";

/**
 * Minimal signer seam so {@link S3BaseProvider} can be unit-tested without the
 * real presigner. Defaults to the AWS SDK's `getSignedUrl`.
 */
export type PresignerFn = typeof getSignedUrl;

/**
 * Build a safe `Content-Disposition` value for a download filename.
 *
 * A raw `filename="…"` interpolation lets an attacker-controlled name break out
 * of the quoted string (via `"`, CR/LF or `;`) and inject extra response
 * headers/directives. We emit two tokens per RFC 6266/5987:
 *   - `filename="<ascii>"` — a quote/control-stripped ASCII fallback. We strip
 *     `"`/`\\` first, then fold every non-printable-ASCII byte (incl. CR/LF and
 *     other controls) to `_`, so nothing can inject a new header or directive.
 *   - `filename*=UTF-8''<pct-encoded>` — the canonical, percent-encoded value
 *     that modern browsers prefer, preserving Unicode names exactly.
 */
function contentDispositionAttachment(filename: string): string {
	const asciiFallback = filename
		.replace(/["\\]/g, "")
		.replace(/[^\x20-\x7e]/g, "_");
	const encoded = encodeURIComponent(filename)
		// RFC 5987 reserves a few attr-chars that encodeURIComponent leaves raw;
		// percent-encode them too. Everything else (CR/LF, `"`, `;`) is already
		// escaped by encodeURIComponent.
		.replace(
			/['()*]/g,
			(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
		);
	return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/** Construction options shared by every S3-compatible provider. */
export interface S3BaseProviderOptions {
	/** Pre-built S3 client. Injectable so tests can mock `send`. */
	client: S3Client;
	/** Default bucket used when a call omits an explicit bucket. */
	bucket: string;
	/** Backend discriminator surfaced via {@link StorageDriver.kind}. */
	kind: StorageProviderKind;
	/** Overridable presigner; defaults to the AWS SDK implementation. */
	presigner?: PresignerFn;
}

/**
 * Shared S3 implementation backing both R2 and MinIO.
 *
 * R2 and MinIO are both S3-compatible, so all object operations live here; the
 * concrete providers only differ in how the underlying {@link S3Client} is
 * constructed (endpoint, region, path-style addressing).
 */
export class S3BaseProvider implements StorageDriver {
	readonly kind: StorageProviderKind;
	protected readonly client: S3Client;
	protected readonly defaultBucket: string;
	private readonly presigner: PresignerFn;

	constructor(options: S3BaseProviderOptions) {
		this.client = options.client;
		this.defaultBucket = options.bucket;
		this.kind = options.kind;
		this.presigner = options.presigner ?? getSignedUrl;
	}

	private bucketFor(ref: { bucket?: string }): string {
		return ref.bucket ?? this.defaultBucket;
	}

	private expiry(expiresIn: number | undefined): {
		expiresIn: number;
		expiresAt: Date;
	} {
		const seconds = expiresIn ?? DEFAULT_PRESIGN_EXPIRES_IN;
		return {
			expiresIn: seconds,
			expiresAt: new Date(Date.now() + seconds * 1000),
		};
	}

	async presignPut(params: PresignPutParams): Promise<PresignResult> {
		const command = new PutObjectCommand({
			Bucket: this.bucketFor(params),
			Key: params.key,
			...(params.contentType ? { ContentType: params.contentType } : {}),
			...(params.contentLength !== undefined
				? { ContentLength: params.contentLength }
				: {}),
			...(params.metadata ? { Metadata: params.metadata } : {}),
		});
		const { expiresIn, expiresAt } = this.expiry(params.expiresIn);
		const url = await this.presigner(this.client, command, { expiresIn });
		return { url, expiresAt };
	}

	async presignGet(params: PresignGetParams): Promise<PresignResult> {
		const command = new GetObjectCommand({
			Bucket: this.bucketFor(params),
			Key: params.key,
			...(params.downloadFilename
				? {
						ResponseContentDisposition: contentDispositionAttachment(
							params.downloadFilename,
						),
					}
				: {}),
		});
		const { expiresIn, expiresAt } = this.expiry(params.expiresIn);
		const url = await this.presigner(this.client, command, { expiresIn });
		return { url, expiresAt };
	}

	async head(ref: ObjectRef): Promise<HeadResult> {
		const response = await this.client.send(
			new HeadObjectCommand({ Bucket: this.bucketFor(ref), Key: ref.key }),
		);
		return {
			contentLength: response.ContentLength ?? 0,
			...(response.ContentType ? { contentType: response.ContentType } : {}),
			...(response.ETag ? { etag: response.ETag } : {}),
			...(response.LastModified ? { lastModified: response.LastModified } : {}),
			...(response.Metadata ? { metadata: response.Metadata } : {}),
		};
	}

	async delete(ref: ObjectRef): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({ Bucket: this.bucketFor(ref), Key: ref.key }),
		);
	}

	async copy(params: CopyParams): Promise<void> {
		const sourceBucket = this.bucketFor(params.source);
		await this.client.send(
			new CopyObjectCommand({
				Bucket: this.bucketFor(params.destination),
				Key: params.destination.key,
				CopySource: `${sourceBucket}/${encodeURIComponent(params.source.key)}`,
				...(params.contentType
					? { ContentType: params.contentType, MetadataDirective: "REPLACE" }
					: {}),
			}),
		);
	}

	async list(params: ListParams = {}): Promise<ListResult> {
		const response = await this.client.send(
			new ListObjectsV2Command({
				Bucket: this.bucketFor(params),
				...(params.prefix ? { Prefix: params.prefix } : {}),
				...(params.maxKeys !== undefined ? { MaxKeys: params.maxKeys } : {}),
				...(params.cursor ? { ContinuationToken: params.cursor } : {}),
			}),
		);
		const objects = (response.Contents ?? []).map((item) => ({
			key: item.Key ?? "",
			size: item.Size ?? 0,
			...(item.LastModified ? { lastModified: item.LastModified } : {}),
			...(item.ETag ? { etag: item.ETag } : {}),
		}));
		return {
			objects,
			...(response.NextContinuationToken
				? { cursor: response.NextContinuationToken }
				: {}),
		};
	}
}
