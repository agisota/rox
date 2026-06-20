"use client";

import { useState } from "react";

import { ThreadList } from "../ThreadList";
import { ThreadView } from "../ThreadView";

/**
 * The unified inbox / team chat surface: a left thread list + a right thread
 * view. The selected thread id lives here so both panes stay in sync. On mobile
 * the list collapses when a thread is open (single-column drill-in).
 *
 * Everything below is cache-first (AGENTS.md #9): persisted threads/messages
 * render before readiness; skeletons only fill empty first loads.
 */
export function InboxScreen() {
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

	return (
		<div className="mx-auto flex h-[calc(100dvh-3rem)] w-full max-w-6xl">
			{/* Left: thread list. Hidden on mobile once a thread is open. */}
			<aside
				className={`w-full shrink-0 border-r md:w-80 ${
					activeThreadId ? "hidden md:block" : "block"
				}`}
			>
				<ThreadList
					activeThreadId={activeThreadId}
					onSelect={setActiveThreadId}
				/>
			</aside>

			{/* Right: thread view. Hidden on mobile until a thread is selected. */}
			<section
				className={`min-w-0 flex-1 ${
					activeThreadId ? "block" : "hidden md:block"
				}`}
			>
				{/* Mobile back affordance to return to the list. */}
				{activeThreadId && (
					<button
						type="button"
						onClick={() => setActiveThreadId(null)}
						className="border-b px-4 py-2 text-left text-xs text-muted-foreground md:hidden"
					>
						← Все переписки
					</button>
				)}
				<ThreadView threadId={activeThreadId} />
			</section>
		</div>
	);
}
