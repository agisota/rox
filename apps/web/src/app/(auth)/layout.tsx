import { auth } from "@superset/auth/server";
import { COMPANY } from "@superset/shared/constants";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/env";

export default async function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (session) {
		redirect("/");
	}

	return (
		<div className="relative flex min-h-screen flex-col">
			<header className="container mx-auto px-6 py-6">
				<a
					href={env.NEXT_PUBLIC_MARKETING_URL}
					className="text-lg font-semibold tracking-tight"
					aria-label={COMPANY.NAME}
				>
					{COMPANY.NAME}
				</a>
			</header>
			<main className="flex flex-1 items-center justify-center">
				{children}
			</main>
		</div>
	);
}
