import { parseDesktopLoopbackCallback } from "@rox/shared/desktop-callback";

import { TelegramLoginButton } from "@/app/(auth)/components/TelegramLoginButton";
import { env } from "@/env";

/**
 * Desktop Telegram sign-in (ROX-522).
 *
 * Telegram login is a web-only Login Widget (not redirect-OAuth), so the desktop
 * app can't initiate it from `/api/auth/desktop/connect`. That route instead
 * bounces the browser here, carrying the desktop round-trip params
 * (`desktop_state` / `desktop_protocol` / `desktop_local_callback`).
 *
 * This page renders the official Telegram widget. Its `data-auth-url` points at
 * the better-auth Telegram callback with `callbackURL` set to the existing
 * `/auth/desktop/success` page (with the desktop params preserved). After the
 * user completes Telegram auth, the callback establishes the session cookie and
 * redirects to the success page, where the provider-agnostic token round-trip
 * mints a desktop session token and deep-links it back into the app.
 *
 * Deliberately placed OUTSIDE the `(auth)` route group: that group's layout
 * redirects any already-authenticated session to `/`, which would break a
 * desktop sign-in for a user who happens to already hold a web session.
 */
export default async function DesktopTelegramPage({
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
		desktop_protocol: desktopProtocolParam,
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

	// Mirror the success page's scheme allow-list so a crafted protocol can't be
	// smuggled through. Defaults to `rox`. The success page re-validates too.
	const desktopProtocol = /^rox(-[a-z0-9]+)?$/.test(desktopProtocolParam ?? "")
		? (desktopProtocolParam as string)
		: "rox";

	// Build the post-Telegram callback: the desktop success page carrying the
	// desktop round-trip params. The Telegram callback validates this is
	// same-origin to the web app before honoring it.
	const successUrl = new URL(`${env.NEXT_PUBLIC_WEB_URL}/auth/desktop/success`);
	successUrl.searchParams.set("desktop_state", state);
	successUrl.searchParams.set("desktop_protocol", desktopProtocol);
	const validatedCallback = parseDesktopLoopbackCallback(localCallbackBase);
	if (validatedCallback) {
		successUrl.searchParams.set(
			"desktop_local_callback",
			validatedCallback.toString(),
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
			<div className="flex flex-col items-center gap-2 text-center">
				<h1 className="text-xl font-semibold text-foreground">
					Войти через Telegram
				</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					Подтвердите вход в Telegram, чтобы вернуться в настольное приложение.
				</p>
			</div>
			<TelegramLoginButton callbackURL={successUrl.toString()} />
		</div>
	);
}
