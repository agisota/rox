import { db } from "@rox/db/client";
import { integrationConnections } from "@rox/db/schema";
import { refreshLinearToken } from "@rox/trpc/integrations/linear";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { isQstashDevBypassAllowed, verifyQstash } from "@/lib/qstash-verify";

export async function POST(request: Request) {
	const verified = await verifyQstash(request, {
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/jobs/refresh-tokens`,
		devBypass: isQstashDevBypassAllowed(),
		onError: "respond",
		verifyErrorMessage: "Signature verification failed",
		logError: (verifyError) =>
			logger.error(
				"[linear-refresh-cron] Signature verification failed:",
				verifyError,
			),
	});
	if (!verified.ok) {
		return verified.response;
	}

	const stale = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.provider, "linear"),
			isNull(integrationConnections.disconnectedAt),
			isNotNull(integrationConnections.refreshToken),
			lt(
				integrationConnections.tokenExpiresAt,
				sql`now() + interval '90 minutes'`,
			),
		),
		columns: { id: true },
	});

	const results = await Promise.allSettled(
		stale.map(async (connection) => {
			try {
				await refreshLinearToken(connection.id);
				return { id: connection.id, ok: true };
			} catch (error) {
				logger.error(
					`[linear-refresh-cron] failed for ${connection.id}:`,
					error,
				);
				return { id: connection.id, ok: false };
			}
		}),
	);

	const succeeded = results.filter(
		(result) => result.status === "fulfilled" && result.value.ok,
	).length;

	return Response.json({ candidates: stale.length, succeeded });
}
