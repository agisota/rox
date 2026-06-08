import { auth } from "@rox/auth/server";
import { headers } from "next/headers";

import { DesktopRedirect } from "./components/DesktopRedirect";
import { mintDesktopSession } from "./mintDesktopSession";

function AuthError({ message }: { message: string }) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<p className="text-xl text-muted-foreground">{message}</p>
			<p className="text-muted-foreground/70">
				Please try signing in again from the desktop app.
			</p>
		</div>
	);
}

export default async function DesktopSuccessPage({
	searchParams,
}: {
	searchParams: Promise<{
		desktop_state?: string;
		desktop_protocol?: string;
		desktop_local_callback?: string;
	}>;
}) {
	const {
		desktop_state: state,
		desktop_protocol = "rox",
		desktop_local_callback: localCallbackBase,
	} = await searchParams;

	if (!state) {
		return <AuthError message="Missing auth state" />;
	}

	// Read-only session check on GET — the session row is minted by the
	// idempotent POST action below, not during render, so refreshes/prefetches
	// don't spawn duplicate desktop sessions.
	let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
	try {
		session = await auth.api.getSession({ headers: await headers() });
	} catch (error) {
		console.error("Failed to get session for desktop auth:", error);
		return <AuthError message="Authentication failed" />;
	}

	if (!session) {
		return <AuthError message="Authentication failed" />;
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<DesktopRedirect
				mintAction={mintDesktopSession}
				state={state}
				protocol={desktop_protocol}
				localCallbackBase={localCallbackBase}
			/>
		</div>
	);
}
