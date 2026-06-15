import { isV2OnlyUser } from "@rox/shared/v2-only-user";
import { authClient } from "renderer/lib/auth-client";

/**
 * True for accounts that should hide legacy v1 affordances entirely.
 */
export function useIsV2OnlyUser(): boolean {
	const { data: session } = authClient.useSession();
	return isV2OnlyUser(session?.user?.createdAt);
}

/** Returns whether v2 is currently active for this user. */
export function useIsV2CloudEnabled(): boolean {
	return true;
}
