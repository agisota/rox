/**
 * Graph core (#01) — shared handle types for the graph-service.
 *
 * `GraphDb` is the read connection (`db`); `GraphTx` is the write transaction
 * handle passed to `dbWs.transaction(async (tx) => …)`. Derived the same way as
 * `KnowledgeTx` in `router/knowledge/backlinks.ts` so mutating methods can run
 * inside a domain's transaction.
 */

import type { db, dbWs } from "@rox/db/client";

/** Read connection. */
export type GraphDb = typeof db;

/** Write transaction handle (from `dbWs.transaction(async (tx) => …)`). */
export type GraphTx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];
