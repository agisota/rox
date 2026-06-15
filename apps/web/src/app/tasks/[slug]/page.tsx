"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Deep link passthrough page for tasks.
 * Attempts to open the Rox desktop app, falls back to dashboard.
 */
export default function TaskDeepLinkPage() {
	const params = useParams<{ slug: string }>();
	const slug = params.slug;
	const deepLink = `rox://tasks/${slug}`;

	useEffect(() => {
		window.location.href = deepLink;
	}, [deepLink]);

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<div className="flex flex-col items-center gap-6">
				<Image
					src="/rox-logo-light.png"
					alt="Rox"
					width={52}
					height={80}
					priority
				/>
				<p className="text-xl text-muted-foreground">
					Открываем настольное приложение...
				</p>
				<Link
					href={deepLink}
					className="text-sm text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
				>
					Открыть вручную, если переход не сработал
				</Link>
			</div>
		</div>
	);
}
