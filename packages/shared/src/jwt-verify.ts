import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * The claims every Rox JWT carries that the relay and electric-proxy both rely
 * on for tenancy. `sub` is the user id, `organizationIds` is the set of orgs the
 * user belongs to (used for the cheap org-membership short-circuit), and `email`
 * is best-effort (some tokens omit it).
 */
export interface RoxJwtClaims {
	sub: string;
	email: string;
	organizationIds: string[];
}

// Lazily-memoized remote JWKS per auth URL. `jose` handles key rotation
// internally; we only avoid rebuilding the set (and its fetch) on every call.
const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(authUrl: string): ReturnType<typeof createRemoteJWKSet> {
	let jwks = jwksByUrl.get(authUrl);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL("/api/auth/jwks", authUrl));
		jwksByUrl.set(authUrl, jwks);
	}
	return jwks;
}

/**
 * Verify a Rox-issued JWT against the better-auth JWKS endpoint and return its
 * tenancy claims, or `null` if the token is invalid/expired/malformed.
 *
 * This is the single source of truth shared by `apps/relay` and
 * `apps/electric-proxy` so the two auth planes can't silently drift (clock-skew
 * tolerance, claim shape, expiry logging). It NEVER throws and NEVER logs PII:
 * - Expected hourly-rotation expiries (`ERR_JWT_EXPIRED`) are silent.
 * - Any other failure logs only the terse error message (no stack, no decoded
 *   payload — the payload can contain plaintext emails at relay volume).
 *
 * @param token   the bearer token (already stripped of the `Bearer ` prefix)
 * @param jwksUrl the auth origin; `/api/auth/jwks` is appended for the JWKS
 * @param logPrefix optional log tag (e.g. `relay`) for the terse failure line
 */
export async function verifyRoxJwt(
	token: string,
	jwksUrl: string,
	logPrefix = "jwt-verify",
): Promise<RoxJwtClaims | null> {
	try {
		const { payload } = await jwtVerify(token, getJWKS(jwksUrl), {
			issuer: jwksUrl,
			audience: jwksUrl,
		});

		const sub = payload.sub;
		const email = payload.email as string | undefined;
		const organizationIds = payload.organizationIds as string[] | undefined;

		if (!sub || !organizationIds) {
			return null;
		}

		return { sub, email: email ?? "", organizationIds };
	} catch (error) {
		// Don't log expected hourly-rotation expiries, and log only the terse
		// message otherwise: the full error would dump a stack trace + decoded
		// payload (plaintext emails) on every request at relay volume.
		const code =
			error instanceof Error && "code" in error
				? (error as { code?: string }).code
				: undefined;
		if (code !== "ERR_JWT_EXPIRED") {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[${logPrefix}] JWT verification failed: ${message}`);
		}
		return null;
	}
}
