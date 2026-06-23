"use client";

import { useEffect, useRef } from "react";
import { env } from "@/env";

interface TelegramLoginButtonProps {
	/**
	 * Where the API should redirect after a successful Telegram login. Passed
	 * through to `/api/auth/telegram/callback?callbackURL=...`; the API validates
	 * it is same-origin before honoring it.
	 */
	callbackURL: string;
}

/**
 * Telegram Login Widget (ROX-522).
 *
 * Renders the official telegram.org widget script. On successful auth Telegram
 * itself redirects the browser to `data-auth-url` (our API callback) with the
 * signed payload as query params; the API verifies the HMAC, establishes a
 * better-auth session and redirects back into the app.
 *
 * Renders nothing when `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is unset.
 *
 * NOTE: the widget needs a normal web context (telegram.org script + top-level
 * navigation). Desktop/Electron must use the web flow / a webview — out of
 * scope for ROX-522 Phase 1.
 */
export function TelegramLoginButton({ callbackURL }: TelegramLoginButtonProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const botUsername = env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !botUsername) return;

		// The auth URL Telegram redirects to with the signed login payload.
		const authUrl = new URL(
			"/api/auth/telegram/callback",
			env.NEXT_PUBLIC_API_URL,
		);
		authUrl.searchParams.set("callbackURL", callbackURL);

		const script = document.createElement("script");
		script.src = "https://telegram.org/js/telegram-widget.js?22";
		script.async = true;
		script.setAttribute("data-telegram-login", botUsername);
		script.setAttribute("data-size", "large");
		script.setAttribute("data-radius", "8");
		script.setAttribute("data-auth-url", authUrl.toString());
		script.setAttribute("data-request-access", "write");

		container.appendChild(script);
		return () => {
			container.replaceChildren();
		};
	}, [callbackURL]);

	if (!botUsername) return null;

	return <div ref={containerRef} className="flex justify-center" />;
}
