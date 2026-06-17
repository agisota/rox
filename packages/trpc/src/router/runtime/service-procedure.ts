/**
 * serviceProcedure (#02, §2) — authorization for trusted local workers /
 * supervisor mutations (`embedding.claimBatch` / `embedding.complete` /
 * `runtime.reportHealth`). These move the queue and service health, so a user
 * session is not sufficient — the caller is the `embedder` worker or the
 * `host-service` supervisor, not an end user.
 *
 * Token: a static service token from env/secret-store (`RUNTIME_SERVICE_TOKEN`),
 * sent by the worker in the `x-rox-service-token` header. Comparison is
 * constant-time. Org membership is NOT checked (the worker is not a user);
 * `organizationId` from the input is validated by Zod and used as the write
 * scope. The token is NEVER logged.
 */

import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { publicProcedure } from "../../trpc";

const SERVICE_TOKEN_HEADER = "x-rox-service-token";
let didWarnMissingServiceToken = false;

/** Resolve the runtime service token from env/secret-store (never from DB). */
function getServiceToken(): string {
	const token = process.env.RUNTIME_SERVICE_TOKEN ?? "";
	if (token.length === 0 && !didWarnMissingServiceToken) {
		didWarnMissingServiceToken = true;
		console.warn(
			"[runtime] RUNTIME_SERVICE_TOKEN is not set; service workers will be rejected",
		);
	}
	return token;
}

/** Constant-time equality that tolerates differing lengths without leaking. */
function tokensMatch(provided: string, expected: string): boolean {
	if (expected.length === 0) return false;
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/**
 * serviceProcedure gates on the service token, not on a user session. On a
 * missing/invalid token it throws `UNAUTHORIZED` before the procedure body runs,
 * so the queue / health are never touched.
 */
export const serviceProcedure = publicProcedure.use(async ({ ctx, next }) => {
	const provided = ctx.headers.get(SERVICE_TOKEN_HEADER) ?? "";
	const expected = getServiceToken();
	if (!tokensMatch(provided, expected)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "invalid service token",
		});
	}
	return next({ ctx });
});
