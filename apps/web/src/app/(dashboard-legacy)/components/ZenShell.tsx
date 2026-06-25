"use client";

import { useZenMode } from "@rox/ui/hooks/use-zen-mode";
import {
	useShouldAnimate,
	zenDensity,
	zenSceneTransition,
} from "@rox/ui/motion";
import { motion } from "framer-motion";
import { type ReactNode, useEffect } from "react";

/**
 * Web Focus / Zen mode shell (F56, Hermes-borrow #649).
 *
 * Client wrapper for the dashboard shell that consumes the same platform-neutral
 * `@rox/shared/zen-mode` store as desktop (via `@rox/ui` `useZenMode`). When zen
 * is active it collapses the sidebar rail, lets the main canvas take the full
 * width, and dims the surrounding chrome — mirroring the desktop shell behavior.
 *
 * The toggle is bound to ⌘. / Ctrl+. (the desktop `TOGGLE_ZEN_MODE` chord),
 * following the F44 web command-palette host's keyboard-binding idiom. Motion is
 * gated on `useShouldAnimate('decorative')` so reduced-motion users get an
 * instant collapse with no animation.
 */
export function ZenShell({
	sidebar,
	children,
}: {
	sidebar: ReactNode;
	children: ReactNode;
}) {
	const { isZen, toggleZen } = useZenMode();
	const shouldAnimate = useShouldAnimate("decorative");

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.key === "." && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				toggleZen();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [toggleZen]);

	const transition = shouldAnimate ? zenSceneTransition : { duration: 0 };

	return (
		<div className="flex flex-col gap-8 md:flex-row">
			<motion.aside
				className="shrink-0 overflow-hidden"
				initial={false}
				animate={{
					width: isZen ? 0 : "20rem",
					opacity: isZen ? zenDensity.chromeDim : zenDensity.chromeRest,
				}}
				transition={transition}
				aria-hidden={isZen}
			>
				<div className="sticky top-24 w-80">{sidebar}</div>
			</motion.aside>

			<main className="min-w-0 flex-1">{children}</main>
		</div>
	);
}
