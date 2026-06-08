"use server";

import { auth } from "@rox/auth/server";
import { db } from "@rox/db/client";
import { sessions } from "@rox/db/schema/auth";
import { headers } from "next/headers";

export interface MintDesktopSessionInput {
	state: string;
	protocol: string;
	localCallbackBase?: string;
}

export type MintDesktopSessionResult =
	| { ok: true; desktopUrl: string; localCallbackUrl?: string }
	| { ok: false; error: string };

const THIRTY_DAYS_MS = 60 * 60 * 24 * 30 * 1000;

/**
 * Mints an independent desktop session token and returns the deep-link URLs.
 *
 * This is invoked as a POST (server action) from DesktopRedirect rather than
 * during the GET render of the success page, so browser prefetches/refreshes of
 * the page no longer spawn duplicate 30-day sessions — the insert only happens
 * when the client explicitly triggers the redirect.
 */
export async function mintDesktopSession(
	input: MintDesktopSessionInput,
): Promise<MintDesktopSessionResult> {
	const headersObj = await headers();
	const session = await auth.api.getSession({ headers: headersObj });
	if (!session) {
		return { ok: false, error: "Not authenticated" };
	}

	// Desktop and web need independent sessions with separate
	// activeOrganizationId.
	const userAgent = headersObj.get("user-agent") || "Rox Desktop App";
	const ipAddress =
		headersObj.get("x-forwarded-for")?.split(",")[0] ||
		headersObj.get("x-real-ip") ||
		undefined;

	const crypto = await import("node:crypto");
	const token = crypto.randomBytes(32).toString("base64url");
	const now = new Date();
	const expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS);

	await db.insert(sessions).values({
		token,
		userId: session.user.id,
		expiresAt,
		ipAddress,
		userAgent,
		activeOrganizationId: session.session.activeOrganizationId,
		updatedAt: now,
	});

	const expiresAtIso = expiresAt.toISOString();
	const query = `token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAtIso)}&state=${encodeURIComponent(input.state)}`;
	const desktopUrl = `${input.protocol}://auth/callback?${query}`;
	const localCallbackUrl = input.localCallbackBase
		? `${input.localCallbackBase}?${query}`
		: undefined;

	return { ok: true, desktopUrl, localCallbackUrl };
}
