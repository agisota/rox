import type { TRPCRouterRecord } from "@trpc/server";
import { createProviderConnectionRouter } from "../shared/provider-router";

/**
 * PARKED (WS-O §1.1): connect-only baseline. A real Notion sync job already
 * exists (`apps/api/.../integrations/notion/jobs/sync/route.ts`) but there is no
 * connect→sync trigger wiring in this router yet. Follow-up: wire the
 * connect-time sync trigger. Do NOT remove the `notion` provider enum value or
 * the sync job — provider removal is a destructive live-enum migration and is
 * out of scope.
 */
export const notionRouter = createProviderConnectionRouter(
	"notion",
) satisfies TRPCRouterRecord;
