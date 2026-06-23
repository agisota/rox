import { type RoxJwtClaims, verifyRoxJwt } from "@rox/shared/jwt-verify";

// Relay keeps its own `AuthContext` name for call-sites; it is the shared
// `RoxJwtClaims` shape. The verification logic lives in `@rox/shared/jwt-verify`
// so the relay and electric-proxy planes can't drift.
export type AuthContext = RoxJwtClaims;

export function verifyJWT(
	token: string,
	authUrl: string,
): Promise<AuthContext | null> {
	return verifyRoxJwt(token, authUrl, "relay");
}
