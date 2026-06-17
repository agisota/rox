/**
 * Graph core (#01) — public surface of the graph-service library.
 *
 * Domain routers import `graphService` (the only writer of entities/edges) and
 * `createGraphSearchService` (the read-path with DI for the #02 embedder), plus
 * the pure helpers (`buildEmbedText`/`entityToQdrantPayload`/…) consumed by the
 * #02 indexer.
 */

export * from "./embed";
export * from "./graph-service";
export * from "./idempotency";
export * from "./links";
export * from "./search";
export * from "./types";
