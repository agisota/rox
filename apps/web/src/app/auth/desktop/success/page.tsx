import { auth } from "@rox/auth/server";
import { db } from "@rox/db/client";
import { sessions } from "@rox/db/schema/auth";
import { headers } from "next/headers";

import { DesktopRedirect } from "./components/DesktopRedirect";

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
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
				<p className="text-xl text-muted-foreground">
					Не найдено состояние входа
				</p>
				<p className="text-muted-foreground/70">
					Попробуйте снова войти из настольного приложения.
				</p>
			</div>
		);
	}

	let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
	try {
		session = await auth.api.getSession({ headers: await headers() });
	} catch (error) {
		console.error("Failed to get session for desktop auth:", error);
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
				<p className="text-xl text-muted-foreground">Не удалось войти</p>
				<p className="text-muted-foreground/70">
					Попробуйте снова войти из настольного приложения.
				</p>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
				<p className="text-xl text-muted-foreground">Не удалось войти</p>
				<p className="text-muted-foreground/70">
					Попробуйте снова войти из настольного приложения.
				</p>
			</div>
		);
	}

	// Desktop and web need independent sessions with separate activeOrganizationId
	const headersObj = await headers();
	const userAgent = headersObj.get("user-agent") || "Rox Desktop App";
	const ipAddress =
		headersObj.get("x-forwarded-for")?.split(",")[0] ||
		headersObj.get("x-real-ip") ||
		undefined;

	const crypto = await import("node:crypto");
	const token = crypto.randomBytes(32).toString("base64url");
	const now = new Date();
	const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 30 * 1000);

	await db.insert(sessions).values({
		token,
		userId: session.user.id,
		expiresAt,
		ipAddress,
		userAgent,
		activeOrganizationId: session.session.activeOrganizationId,
		updatedAt: now,
	});
	const desktopUrl = `${desktop_protocol}://auth/callback?token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt.toISOString())}&state=${encodeURIComponent(state)}`;
	const localCallbackUrl = localCallbackBase
		? `${localCallbackBase}?token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt.toISOString())}&state=${encodeURIComponent(state)}`
		: undefined;

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<DesktopRedirect url={desktopUrl} localCallbackUrl={localCallbackUrl} />
		</div>
	);
}
