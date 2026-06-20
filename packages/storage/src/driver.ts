import type {
	CopyParams,
	HeadResult,
	ListParams,
	ListResult,
	ObjectRef,
	PresignGetParams,
	PresignPutParams,
	PresignResult,
	StorageProviderKind,
} from "./types.ts";

/**
 * Backend-agnostic object-storage contract.
 *
 * Every concrete provider (R2, MinIO) implements this interface, so the rest of
 * the suite depends only on the abstraction and can swap backends via config.
 * The `list` method is optional because not every deployment surfaces listing.
 */
export interface StorageDriver {
	/** Which backend this driver talks to. */
	readonly kind: StorageProviderKind;

	/** Generate a presigned URL the client can use to upload an object. */
	presignPut(params: PresignPutParams): Promise<PresignResult>;

	/** Generate a presigned URL the client can use to download an object. */
	presignGet(params: PresignGetParams): Promise<PresignResult>;

	/** Fetch object metadata without downloading the body. */
	head(ref: ObjectRef): Promise<HeadResult>;

	/** Delete an object. Idempotent: deleting a missing key resolves. */
	delete(ref: ObjectRef): Promise<void>;

	/** Server-side copy from one key/bucket to another. */
	copy(params: CopyParams): Promise<void>;

	/** Optionally list objects under a prefix. */
	list?(params?: ListParams): Promise<ListResult>;
}

/**
 * Alias kept for naming parity with call sites that refer to the higher-level
 * "provider" while {@link StorageDriver} describes the low-level contract. They
 * are structurally identical.
 */
export type StorageProvider = StorageDriver;
