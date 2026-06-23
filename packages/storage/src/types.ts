/**
 * Shared parameter and result types for the storage abstraction.
 *
 * These types are intentionally driver-agnostic so the same call sites work
 * whether the backing store is Cloudflare R2 (primary) or a self-hosted MinIO
 * deployment (secondary). Both are S3-compatible; see {@link StorageDriver}.
 */

/** Identifies which concrete storage backend a provider talks to. */
export type StorageProviderKind = "r2" | "minio";

/** A single object reference within a bucket. */
export interface ObjectRef {
	/** Object key (path) inside the bucket. */
	key: string;
	/**
	 * Optional bucket override. When omitted, the provider's configured default
	 * bucket is used.
	 */
	bucket?: string;
}

/** Options shared by presigned-URL operations. */
export interface PresignOptions {
	/**
	 * URL lifetime in seconds. Defaults to {@link DEFAULT_PRESIGN_EXPIRES_IN}
	 * when omitted.
	 */
	expiresIn?: number;
}

/** Parameters for generating a presigned upload (PUT) URL. */
export interface PresignPutParams extends ObjectRef, PresignOptions {
	/** Content-Type the client is required to send with the upload. */
	contentType?: string;
	/** Exact content length, in bytes, the upload must match. */
	contentLength?: number;
	/** Arbitrary user metadata to bind to the object (`x-amz-meta-*`). */
	metadata?: Record<string, string>;
}

/** Parameters for generating a presigned download (GET) URL. */
export interface PresignGetParams extends ObjectRef, PresignOptions {
	/**
	 * Forces a `Content-Disposition` response header so the browser downloads
	 * the object with the given filename instead of rendering inline.
	 */
	downloadFilename?: string;
}

/** Result of a presign operation. */
export interface PresignResult {
	/** The signed URL the client should use. */
	url: string;
	/** Absolute expiry time of the URL. */
	expiresAt: Date;
}

/** Metadata returned by a HEAD request against an object. */
export interface HeadResult {
	/** Object size in bytes. */
	contentLength: number;
	/** Stored content type, if any. */
	contentType?: string;
	/** Entity tag (usually an MD5 / multipart hash). */
	etag?: string;
	/** Last modification timestamp. */
	lastModified?: Date;
	/** User metadata (`x-amz-meta-*`). */
	metadata?: Record<string, string>;
}

/** Parameters for copying an object between keys/buckets. */
export interface CopyParams {
	/** Source object reference. */
	source: ObjectRef;
	/** Destination object reference. */
	destination: ObjectRef;
	/** Optional content type to set on the copy. */
	contentType?: string;
}

/** Parameters for listing objects under a prefix. */
export interface ListParams {
	/** Key prefix to filter by. */
	prefix?: string;
	/** Bucket override. */
	bucket?: string;
	/** Max keys to return in this page. */
	maxKeys?: number;
	/** Pagination cursor returned by a previous {@link ListResult}. */
	cursor?: string;
}

/** A single entry in a list response. */
export interface ListEntry {
	/** Object key. */
	key: string;
	/** Object size in bytes. */
	size: number;
	/** Last modification timestamp. */
	lastModified?: Date;
	/** Entity tag. */
	etag?: string;
}

/** Result of a list operation. */
export interface ListResult {
	/** Objects in this page. */
	objects: ListEntry[];
	/** Cursor to fetch the next page, or `undefined` when exhausted. */
	cursor?: string;
}

/** Default presigned-URL lifetime: 15 minutes. */
export const DEFAULT_PRESIGN_EXPIRES_IN = 900;
