"use client";

import { Tabs, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { Mail, MessagesSquare } from "lucide-react";
import { useState } from "react";

import { useCommsStream } from "../../hooks/useCommsStream";
import { MailInbox } from "../MailInbox";
import { ThreadList } from "../ThreadList";
import { ThreadView } from "../ThreadView";

type InboxTransport = "chat" | "mail";

/**
 * The unified inbox surface. A transport switch sits above two split-pane views:
 *
 *   • "Чат"   — the in-app comms threads (`comms.*`): left thread list + right
 *               thread view + composer.
 *   • "Почта" — the per-user `<handle>@rox.one` mailbox (`mail.*`): the same
 *               split-pane shape, threaded email + reply/compose (D3 P3).
 *
 * Email is a transport WITHIN the one inbox, not a separate destination, so the
 * nav still points at a single `/inbox`. Everything is cache-first (AGENTS.md
 * #9): persisted threads/messages render before readiness; skeletons only fill
 * empty first loads.
 */
export function InboxScreen() {
	const [transport, setTransport] = useState<InboxTransport>("chat");
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

	// Live delivery: keep one SSE connection open for the unified inbox. A chat
	// (transport=inapp) event refreshes comms.*; an email event refreshes mail.*
	// (FIX 3) — the Mail tab reads mail.listThreads/getThread, not comms.*, so it
	// would never live-update otherwise. The open-thread id is the active thread
	// for whichever transport tab is showing.
	useCommsStream({ openThreadId: activeThreadId, transport });

	return (
		<div className="mx-auto flex h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col">
			<Tabs
				value={transport}
				onValueChange={(value) => {
					setTransport(value as InboxTransport);
					setActiveThreadId(null);
				}}
				className="border-b px-3 py-2"
			>
				<TabsList>
					<TabsTrigger value="chat" className="gap-1.5 text-xs">
						<MessagesSquare className="size-3.5" /> Чат
					</TabsTrigger>
					<TabsTrigger value="mail" className="gap-1.5 text-xs">
						<Mail className="size-3.5" /> Почта
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{transport === "mail" ? (
				<div className="min-h-0 flex-1">
					<MailInbox
						activeThreadId={activeThreadId}
						onSelect={setActiveThreadId}
					/>
				</div>
			) : (
				<div className="flex min-h-0 flex-1">
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
			)}
		</div>
	);
}
