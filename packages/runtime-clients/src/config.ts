/**
 * Runtime-client configuration (#02, §3). Ports/endpoints + provider/embedding
 * config resolved from env. Local ports are fixed offsets from `ROX_PORT_BASE`
 * (Postgres +14, neon-proxy +15, minio +16/+17, qdrant +18, embedder +19).
 *
 * SECURITY: S3 credentials and provider API keys are read from env/secret-store
 * ONLY (never from a DB column, never logged). This module exposes endpoints and
 * non-secret config; secret resolution stays in the consumer (router/worker).
 */

import type { AiProviderKind } from "@rox/db/enums";
import { type AIProvider, createHttpEmbedder } from "./ai-provider";
import { createUrlObjectStore, type ObjectStore } from "./object-store";
import {
	readEmbeddingDim,
	readEmbeddingProvider,
	readEmbeddingVersion,
} from "./runtime-config";
import { createQdrantVectorStore, type VectorStore } from "./vector-store";

/** Vector dimension (B2). Shared with the Zod boundary schema. */
export const EMBEDDING_DIM = readEmbeddingDim();

/** Current embedding model/config version (B2). Bumped on model change. */
export const EMBEDDING_VERSION = readEmbeddingVersion();

/** Single qdrant collection (00-SC §2A). */
export const QDRANT_COLLECTION = "rox_entities";

function portBase(): number {
	return Number(process.env.ROX_PORT_BASE ?? 3000);
}

function localUrl(port: number): string {
	return `http://127.0.0.1:${port}`;
}

export interface ObjectStoreConfig {
	/** S3 API endpoint (minio local, or any S3-compatible host in prod). */
	endpoint: string;
	region: string;
	/** Env key NAMES of the credentials (values resolved by the consumer). */
	accessKeyEnv: string;
	secretKeyEnv: string;
	forcePathStyle: boolean;
}

export interface VectorStoreConfig {
	/** qdrant HTTP REST endpoint. */
	endpoint: string;
	collection: string;
	dim: number;
	/** Optional API-key env name (qdrant cloud); empty for local. */
	apiKeyEnv: string;
}

export interface EmbedderConfig {
	/** embedder sidecar HTTP endpoint (ONNX in-process worker). */
	endpoint: string;
	provider: AiProviderKind;
	dim: number;
}

export interface RuntimeClientConfig {
	objectStore: ObjectStoreConfig;
	vectorStore: VectorStoreConfig;
	embedder: EmbedderConfig;
}

/** Resolve runtime-client config from env (non-secret values only). */
export function runtimeClientConfig(): RuntimeClientConfig {
	const base = portBase();
	return {
		objectStore: {
			endpoint:
				process.env.S3_ENDPOINT ??
				localUrl(Number(process.env.LOCAL_MINIO_PORT ?? base + 16)),
			region: process.env.S3_REGION ?? "us-east-1",
			accessKeyEnv: "S3_ACCESS_KEY_ID",
			secretKeyEnv: "S3_SECRET_ACCESS_KEY",
			forcePathStyle: true,
		},
		vectorStore: {
			endpoint:
				process.env.QDRANT_URL ??
				localUrl(Number(process.env.LOCAL_QDRANT_PORT ?? base + 18)),
			collection: QDRANT_COLLECTION,
			dim: EMBEDDING_DIM,
			apiKeyEnv: "QDRANT_API_KEY",
		},
		embedder: {
			endpoint:
				process.env.EMBEDDER_URL ??
				localUrl(Number(process.env.LOCAL_EMBEDDER_PORT ?? base + 19)),
			provider: readEmbeddingProvider(),
			dim: EMBEDDING_DIM,
		},
	};
}

/** minio bucket name for an org (A8): `org-<orgId>`. */
export function orgBucket(organizationId: string): string {
	return `org-${organizationId}`;
}

let objectStore: ObjectStore | null = null;
let vectorStore: VectorStore | null = null;
let embedder: AIProvider | null = null;

export function getObjectStore(): ObjectStore {
	objectStore ??= createUrlObjectStore(runtimeClientConfig().objectStore);
	return objectStore;
}

export function getVectorStore(): VectorStore {
	const config = runtimeClientConfig().vectorStore;
	vectorStore ??= createQdrantVectorStore({
		endpoint: config.endpoint,
		apiKey: process.env[config.apiKeyEnv],
	});
	return vectorStore;
}

export function getEmbedder(): AIProvider {
	const config = runtimeClientConfig().embedder;
	embedder ??= createHttpEmbedder({
		endpoint: config.endpoint,
		kind: config.provider,
	});
	return embedder;
}

export function resetRuntimeClients(): void {
	objectStore = null;
	vectorStore = null;
	embedder = null;
}
