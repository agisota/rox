"use client";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { useState } from "react";

import { MailComposer } from "./MailComposer";
import { MailThreadList } from "./MailThreadList";
import { MailThreadView } from "./MailThreadView";

/**
 * The email surface inside the unified inbox: a left thread list + a right thread
 * view over the caller's `<handle>@rox.one` mailbox, plus a modal composer for a
 * brand-new email. Mirrors the chat `InboxScreen` split-pane so the two
 * transports feel like one inbox. On mobile the list collapses when a thread is
 * open (single-column drill-in).
 */
export function MailInbox() {
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [composeOpen, setComposeOpen] = useState(false);

	return (
		<div className="flex h-full w-full">
			<aside
				className={`w-full shrink-0 border-r md:w-80 ${
					activeThreadId ? "hidden md:block" : "block"
				}`}
			>
				<MailThreadList
					activeThreadId={activeThreadId}
					onSelect={setActiveThreadId}
					onCompose={() => setComposeOpen(true)}
				/>
			</aside>

			<section
				className={`min-w-0 flex-1 ${
					activeThreadId ? "block" : "hidden md:block"
				}`}
			>
				{activeThreadId && (
					<button
						type="button"
						onClick={() => setActiveThreadId(null)}
						className="border-b px-4 py-2 text-left text-xs text-muted-foreground md:hidden"
					>
						← Все письма
					</button>
				)}
				<MailThreadView threadId={activeThreadId} />
			</section>

			<Dialog open={composeOpen} onOpenChange={setComposeOpen}>
				<DialogContent className="max-w-lg p-0">
					<DialogHeader className="sr-only">
						<DialogTitle>Новое письмо</DialogTitle>
					</DialogHeader>
					<MailComposer
						reply={null}
						onSent={() => setComposeOpen(false)}
						onCancel={() => setComposeOpen(false)}
					/>
				</DialogContent>
			</Dialog>
		</div>
	);
}
