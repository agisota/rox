import { type RoxJwtClaims, verifyRoxJwt } from "@rox/shared/jwt-verify";

// electric-proxy keeps its own `AuthContext` name for call-sites; it is the
// shared `RoxJwtClaims` shape. The verification logic lives in
// `@rox/shared/jwt-verify` so the relay and electric-proxy planes can't drift
// (previously these two implementations had already diverged on expiry logging).
export type AuthContext = RoxJwtClaims;

export interface WhereClause {
	fragment: string;
	params: unknown[];
}

export function verifyJWT(
	token: string,
	authUrl: string,
): Promise<AuthContext | null> {
	return verifyRoxJwt(token, authUrl, "electric-proxy");
}
