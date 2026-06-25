import { auth } from "@rox/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { api } from "@/trpc/server";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { SidebarNav } from "./components/SidebarNav";
import { ZenShell } from "./components/ZenShell";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		redirect("/sign-in");
	}

	const trpc = await api();
	const organization = await trpc.user.myOrganization.query();
	const displayName = organization?.name ?? "Rox";

	return (
		<div className="flex min-h-screen flex-col">
			<Header />

			<div className="mx-auto min-h-[calc(100svh-13rem)] w-[95vw] max-w-screen-2xl pb-8 pt-16">
				<ZenShell
					sidebar={
						<>
							<h1 className="text-2xl font-medium leading-none">
								{displayName}
							</h1>
							<SidebarNav />
						</>
					}
				>
					{children}
				</ZenShell>
			</div>

			<Footer />
		</div>
	);
}
