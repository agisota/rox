import type { TRPCRouterRecord } from "@trpc/server";
import { createProviderConnectionRouter } from "../shared/provider-router";

/**
 * PARKED (WS-O §1.1): connect-only baseline, same shape as Notion. A real Fibery
 * sync job already exists (`apps/api/.../integrations/fibery/jobs/sync/route.ts`)
 * but there is no connect→sync trigger wiring in this router yet. Follow-up: wire
 * the connect-time sync trigger. Do NOT remove the `fibery` provider enum value
 * or the sync job — provider removal is out of scope (destructive live-enum
 * migration).
 */
export const fiberyRouter = createProviderConnectionRouter(
	"fibery",
) satisfies TRPCRouterRecord;
