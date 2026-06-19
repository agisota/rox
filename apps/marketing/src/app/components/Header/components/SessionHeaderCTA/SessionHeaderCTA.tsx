"use client";

import { authClient } from "@rox/auth/client";
import { HeaderCTA } from "../../../CTAButtons/HeaderCTA";

interface SessionHeaderCTAProps {
	dashboardUrl: string;
}

export function SessionHeaderCTA({ dashboardUrl }: SessionHeaderCTAProps) {
	const { data: session } = authClient.useSession();

	return <HeaderCTA isLoggedIn={!!session} dashboardUrl={dashboardUrl} />;
}
