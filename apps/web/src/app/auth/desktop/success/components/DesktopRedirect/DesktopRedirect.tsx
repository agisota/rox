"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
	MintDesktopSessionInput,
	MintDesktopSessionResult,
} from "../../mintDesktopSession";

interface DesktopRedirectProps {
	mintAction: (
		input: MintDesktopSessionInput,
	) => Promise<MintDesktopSessionResult>;
	state: string;
	protocol: string;
	localCallbackBase?: string;
}

export function DesktopRedirect({
	mintAction,
	state,
	protocol,
	localCallbackBase,
}: DesktopRedirectProps) {
	// Resolved deep-link URLs once the session has been minted.
	const [urls, setUrls] = useState<{
		url: string;
		localCallbackUrl?: string;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Guard so we only mint a single session per mount, even under React strict
	// mode's double-invoked effects.
	const startedRef = useRef(false);

	useEffect(() => {
		if (startedRef.current) return;
		startedRef.current = true;
		void (async () => {
			const result = await mintAction({
				state,
				protocol,
				localCallbackBase,
			});
			if (!result.ok) {
				setError(result.error);
				return;
			}
			setUrls({
				url: result.desktopUrl,
				localCallbackUrl: result.localCallbackUrl,
			});
		})();
	}, [mintAction, state, protocol, localCallbackBase]);

	useEffect(() => {
		if (!urls) return;
		// Full-page redirect. localhost callback isn't blocked by mixed content
		// (only subresources are), otherwise fall back to the deep link.
		window.location.href = urls.localCallbackUrl ?? urls.url;
	}, [urls]);

	if (error) {
		return (
			<div className="flex flex-col items-center gap-6">
				<Image src="/title.svg" alt="Rox" width={280} height={86} priority />
				<p className="text-xl text-muted-foreground">Authentication failed</p>
				<p className="text-muted-foreground/70">
					Please try signing in again from the desktop app.
				</p>
			</div>
		);
	}

	const fallbackHref = urls?.localCallbackUrl ?? urls?.url;

	return (
		<div className="flex flex-col items-center gap-6">
			<Image src="/title.svg" alt="Rox" width={280} height={86} priority />
			<p className="text-xl text-muted-foreground">
				Redirecting to desktop app...
			</p>
			{fallbackHref && (
				<Link
					href={fallbackHref}
					className="text-sm text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
				>
					Click here if not redirected
				</Link>
			)}
		</div>
	);
}
