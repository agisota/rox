import { auth } from "@rox/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NotesHeader } from "./components/NotesHeader";

/**
 * Notes route shell. Notes are available to any authenticated org member; the
 * only gate here is a session check (org membership is enforced per-procedure in
 * the `notebooks` tRPC router). Mirrors the Drive layout.
 */
export default async function NotesLayout({
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
			<NotesHeader />
			<main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6">
				{children}
			</main>
		</div>
	);
}
