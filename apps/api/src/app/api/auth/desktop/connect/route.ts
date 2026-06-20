import { auth } from "@rox/auth/server";
import { parseDesktopLoopbackCallback } from "@rox/shared/desktop-callback";
import { NextResponse } from "next/server";

import { env } from "@/env";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const provider = url.searchParams.get("provider");
	const state = url.searchParams.get("state");
	const protocol = url.searchParams.get("protocol");
	const localCallback = url.searchParams.get("local_callback");

	if (!provider || !state) {
		return new Response("Missing provider or state", { status: 400 });
	}

	if (
		provider !== "google" &&
		provider !== "github" &&
		provider !== "yandex" &&
		provider !== "telegram"
	) {
		return new Response("Invalid provider", { status: 400 });
	}

	// The web success page mints a fresh desktop session token from whatever
	// session cookie is set, then deep-links it back to the desktop app. The
	// round-trip is provider-agnostic: every provider just needs to land the
	// browser here with an established session cookie.
	const successUrl = new URL(`${env.NEXT_PUBLIC_WEB_URL}/auth/desktop/success`);
	successUrl.searchParams.set("desktop_state", state);
	if (protocol) {
		successUrl.searchParams.set("desktop_protocol", protocol);
	}
	const validatedCallback = parseDesktopLoopbackCallback(localCallback);
	if (validatedCallback) {
		successUrl.searchParams.set(
			"desktop_local_callback",
			validatedCallback.toString(),
		);
	}

	// Telegram is a Login Widget (web-only, not redirect-OAuth), so we can't kick
	// off an OAuth redirect from here. Instead bounce the browser to a web page in
	// desktop-mode that renders the widget; it carries the desktop params through
	// to the success page, where the existing token round-trip takes over.
	if (provider === "telegram") {
		const telegramUrl = new URL(
			`${env.NEXT_PUBLIC_WEB_URL}/auth/desktop/telegram`,
		);
		telegramUrl.searchParams.set("desktop_state", state);
		if (protocol) {
			telegramUrl.searchParams.set("desktop_protocol", protocol);
		}
		if (validatedCallback) {
			telegramUrl.searchParams.set(
				"desktop_local_callback",
				validatedCallback.toString(),
			);
		}
		return NextResponse.redirect(telegramUrl);
	}

	// Yandex is wired through better-auth's `genericOAuth` plugin (providerId
	// "yandex"), so it uses `signInWithOAuth2` rather than `signInSocial`. Both
	// return `{ url }` and stash the callbackURL in the OAuth state, so the
	// provider callback redirects to the desktop success page once the session
	// cookie is set — exactly mirroring the built-in GitHub path below.
	const result =
		provider === "yandex"
			? await auth.api.signInWithOAuth2({
					body: {
						providerId: "yandex",
						callbackURL: successUrl.toString(),
					},
					asResponse: true,
				})
			: await auth.api.signInSocial({
					body: {
						provider,
						callbackURL: successUrl.toString(),
					},
					asResponse: true,
				});

	const cookies = result.headers.getSetCookie();
	const body = (await result.json()) as { url?: string; redirect?: boolean };

	if (!body.url) {
		return new Response(`Failed to initiate OAuth: ${JSON.stringify(body)}`, {
			status: 500,
		});
	}

	const response = NextResponse.redirect(body.url);
	for (const cookie of cookies) {
		response.headers.append("set-cookie", cookie);
	}

	return response;
}
