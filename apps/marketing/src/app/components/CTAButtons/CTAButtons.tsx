import { headers } from "next/headers";

import { env } from "@/env";
import { HeaderCTA } from "./HeaderCTA";

export async function CTAButtons() {
	let isLoggedIn = false;
	if (process.env.DATABASE_URL) {
		try {
			const [{ auth }, requestHeaders] = await Promise.all([
				import("@rox/auth/server"),
				headers(),
			]);
			isLoggedIn = !!(await auth.api.getSession({ headers: requestHeaders }));
		} catch (error) {
			// Handle errors from invalid/stale cookies (e.g., old Clerk cookies after migration to Better Auth).
			console.error("[marketing/CTAButtons] Failed to get session:", error);
		}
	}

	return (
		<HeaderCTA isLoggedIn={isLoggedIn} dashboardUrl={env.NEXT_PUBLIC_WEB_URL} />
	);
}
