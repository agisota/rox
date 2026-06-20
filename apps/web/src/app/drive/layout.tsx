import { auth } from "@rox/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DriveHeader } from "./components/DriveHeader";

/**
 * Drive route group shell. Drive is available to any authenticated user (it is
 * GLOBAL per user per the D8 spec, DQ3 — not org- or flag-gated), so the only
 * gate here is a session check, mirroring `(dashboard-legacy)/layout`.
 */
export default async function DriveLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({ headers: await headers() });

	if (!session) {
		redirect("/sign-in");
	}

	return (
		<div className="flex min-h-[100dvh] flex-col bg-background">
			<DriveHeader />
			<main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-8">
				{children}
			</main>
		</div>
	);
}
