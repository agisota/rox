import type { TRPCRouterRecord } from "@trpc/server";

import { adminOrganizationsRouter } from "./organizations";
import { adminStatsRouter } from "./stats";
import { adminUsersRouter } from "./users";

export const adminRouter = {
	...adminStatsRouter,
	...adminUsersRouter,
	...adminOrganizationsRouter,
} satisfies TRPCRouterRecord;
