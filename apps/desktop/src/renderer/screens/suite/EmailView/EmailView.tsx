import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardSurface } from "renderer/components/DashboardSurface";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import {
	EMPTY_DRAFT,
	type MailDraft,
	parseRecipients,
} from "./components/MailComposer";
import { MailFolderRail } from "./components/MailFolderRail";
import { MailShell } from "./components/MailShell";
import {
	type MailReadFilter,
	MailThreadList,
} from "./components/MailThreadList";
import { MailThreadReader } from "./components/MailThreadReader";
import { filterThreads } from "./lib/filterThreads";
import { messagePreview } from "./lib/mailFormat";
import {
	buildForwardSubject,
	buildMailReplyContext,
} from "./lib/mailReplyContext";
import type { MailFolderId } from "./lib/mailTypes";
import { useMailKeyboard } from "./lib/useMailKeyboard";

/** What the inline composer is currently doing (drives prefill + title). */
type ComposeMode = "new" | "reply" | "replyAll" | "forward";

/**
 * Mail surface — a full-width three-pane client (rail | virtualized list |
 * reader + inline composer) on the existing `mail.*` contract.
 *
 * Standalone (`/email`) it owns its own folder + selection state; embedded in
 * `InboxView` the open thread is lifted via {@link EmailViewProps} so live SSE
 * there can invalidate `mail.getThread`. Either way it renders inside
 * `<DashboardSurface width="full" bare>` — no `max-w` cap, no centered gutter
 * (this is the fix for the old `max-w-5xl`/`max-w-6xl` collision).
 *
 * Security invariants preserved: HTML bodies are DOMPurify-sanitized AND
 * rendered in a sandboxed iframe with remote images blocked by default
 * (`MailHtmlContent`); presigned R2 URLs are never logged; every read/write is
 * owner-scoped server-side.
 *
 * Cache-first (AGENTS.md #9): cached threads/bodies render while refetches run;
 * mutations invalidate rather than block the UI.
 */
export interface EmailViewProps {
	/** Controlled open thread id; omit to use EmailView's internal selection. */
	activeThreadId?: string | null;
	/** Called when the open thread changes (only meaningful when controlled). */
	onSelectThread?: (id: string | null) => void;
}

export function EmailView(props: EmailViewProps = {}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	// ---- Selection (optionally controlled by InboxView) --------------------
	const [internalThreadId, setInternalThreadId] = useState<string | null>(null);
	const isControlled = props.activeThreadId !== undefined;
	const activeThreadId = isControlled
		? (props.activeThreadId ?? null)
		: internalThreadId;
	const setActiveThreadId = (id: string | null) => {
		if (!isControlled) setInternalThreadId(id);
		props.onSelectThread?.(id);
	};

	// ---- Local UI state -----------------------------------------------------
	const [folder, setFolder] = useState<MailFolderId>("inbox");
	const [search, setSearch] = useState("");
	const [readFilter, setReadFilter] = useState<MailReadFilter>("all");
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	const [composeMode, setComposeMode] = useState<ComposeMode | null>(null);
	const [draft, setDraft] = useState<MailDraft>(EMPTY_DRAFT);
	const [outboundDisabled, setOutboundDisabled] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);

	// ---- Data ---------------------------------------------------------------
	const threadsQuery = useQuery(
		trpc.mail.listThreads.queryOptions({ limit: 100 }),
	);
	const allThreads = useMemo(
		() => threadsQuery.data ?? [],
		[threadsQuery.data],
	);

	const visibleThreads = useMemo(
		() => filterThreads(allThreads, folder, search),
		[allThreads, folder, search],
	);

	const threadQuery = useQuery({
		...trpc.mail.getThread.queryOptions({ threadId: activeThreadId ?? "" }),
		enabled: activeThreadId !== null,
	});
	const thread = threadQuery.data?.thread ?? null;
	const messages = useMemo(
		() => threadQuery.data?.messages ?? [],
		[threadQuery.data],
	);

	// ---- Mutations ----------------------------------------------------------
	const invalidateThread = async () => {
		if (!activeThreadId) return;
		await queryClient.invalidateQueries({
			queryKey: trpc.mail.getThread.queryKey({ threadId: activeThreadId }),
		});
	};

	const markRead = useMutation(
		trpc.mail.markRead.mutationOptions({
			onSuccess: invalidateThread,
			onError: (error) => logger.error("[EmailView] markRead failed", error),
		}),
	);

	const send = useMutation(
		trpc.mail.send.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.mail.listThreads.queryKey({ limit: 100 }),
				});
				await invalidateThread();
				closeComposer();
				toast.success("Письмо отправлено");
			},
			onError: (error) => {
				logger.error("[EmailView] send failed", error);
				// Surface a persistent banner when outbound is gated off server-side.
				if (error.data?.code === "PRECONDITION_FAILED") {
					setOutboundDisabled(true);
				}
				toast.error(error.message || "Не удалось отправить письмо");
			},
		}),
	);

	// ---- Effects: open a thread → expand latest + auto-mark-read ------------
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on thread id
	useEffect(() => {
		if (!activeThreadId || messages.length === 0) return;
		// Latest message expanded, rest collapsed (Gmail-like).
		const latest = messages.at(-1);
		setExpandedIds(new Set(latest ? [latest.id] : []));
		// Auto-mark every unread inbound message read on open.
		for (const m of messages) {
			if (!m.isRead && m.direction === "inbound") {
				markRead.mutate({ messageId: m.id, isRead: true });
			}
		}
	}, [activeThreadId, messages.length]);

	// Reset transient state when leaving a thread.
	useEffect(() => {
		if (activeThreadId === null) {
			setExpandedIds(new Set());
			setComposeMode(null);
		}
	}, [activeThreadId]);

	// ---- Composer control ---------------------------------------------------
	const closeComposer = () => {
		setComposeMode(null);
		setDraft(EMPTY_DRAFT);
	};

	const openCompose = (mode: ComposeMode) => {
		if (mode === "new") {
			setDraft(EMPTY_DRAFT);
			setComposeMode("new");
			return;
		}
		if (!thread) return;
		const ctx = buildMailReplyContext(thread, messages, {
			replyAll: mode === "replyAll",
		});
		if (mode === "forward") {
			const last = messages.at(-1);
			const quoted = last?.snippet
				? `\n\n— Пересланное письмо —\n${messagePreview(last.snippet, 500)}`
				: "";
			setDraft({
				...EMPTY_DRAFT,
				subject: buildForwardSubject(last?.subject ?? thread.subjectNorm),
				body: quoted,
			});
		} else {
			setDraft({
				to: ctx.to,
				cc: "",
				bcc: "",
				subject: ctx.subject,
				body: "",
			});
		}
		setComposeMode(mode);
	};

	const handleSend = () => {
		const to = parseRecipients(draft.to);
		const cc = parseRecipients(draft.cc);
		const bcc = parseRecipients(draft.bcc);
		if (to.length === 0 || !draft.body.trim()) return;

		// RFC reply headers come from the thread context for reply/replyAll.
		const replyCtx =
			composeMode === "reply" || composeMode === "replyAll"
				? buildMailReplyContext(thread, messages, {
						replyAll: composeMode === "replyAll",
					})
				: null;

		send.mutate({
			threadId:
				composeMode === "reply" || composeMode === "replyAll"
					? activeThreadId
					: undefined,
			to,
			cc: cc.length ? cc : undefined,
			bcc: bcc.length ? bcc : undefined,
			subject: draft.subject.trim() || undefined,
			body: draft.body,
			inReplyTo: replyCtx?.inReplyTo ?? undefined,
			references: replyCtx?.references.length ? replyCtx.references : undefined,
		});
	};

	// ---- Quick actions (P0: archive/trash unavailable server-side) ----------
	const notImplemented = (label: string) => () => {
		toast.info(`${label}: появится после серверных мутаций mail.*`);
	};

	const markThreadUnread = () => {
		const lastInbound = [...messages]
			.reverse()
			.find((m) => m.direction === "inbound");
		if (lastInbound) {
			markRead.mutate({ messageId: lastInbound.id, isRead: false });
		}
	};

	// ---- Keyboard -----------------------------------------------------------
	const moveSelection = (delta: number) => {
		if (visibleThreads.length === 0) return;
		const idx = visibleThreads.findIndex((t) => t.id === activeThreadId);
		const next =
			idx === -1
				? 0
				: Math.min(Math.max(idx + delta, 0), visibleThreads.length - 1);
		setActiveThreadId(visibleThreads[next].id);
	};

	useMailKeyboard(
		{
			onNext: () => moveSelection(1),
			onPrev: () => moveSelection(-1),
			onOpen: () => {
				if (!activeThreadId && visibleThreads[0]) {
					setActiveThreadId(visibleThreads[0].id);
				}
			},
			onBack: () => {
				if (composeMode) closeComposer();
				else setActiveThreadId(null);
			},
			onReply: () => openCompose("reply"),
			onReplyAll: () => openCompose("replyAll"),
			onArchive: notImplemented("Архивировать"),
			onTrash: notImplemented("Удалить"),
			onSearch: () => searchRef.current?.focus(),
			onCompose: () => openCompose("new"),
		},
		// Disable nav while typing in the composer to avoid hijacking keys.
		composeMode === null,
	);

	// ---- Toggle one message's expanded state --------------------------------
	const toggleMessage = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	// Inbox unread badge: best-effort over loaded threads is not derivable from
	// the thread row (no unread column), so it stays 0 in P0 (see needsShared).
	const inboxUnread = 0;

	const composerProps =
		composeMode !== null
			? {
					draft,
					onChange: setDraft,
					onSend: handleSend,
					onCancel: closeComposer,
					sending: send.isPending,
					outboundDisabled,
					title:
						composeMode === "new"
							? "Новое письмо"
							: composeMode === "forward"
								? "Переслать"
								: composeMode === "replyAll"
									? "Ответить всем"
									: "Ответить",
				}
			: null;

	return (
		<DashboardSurface width="full" bare>
			<div className="h-full min-h-0">
				<MailShell
					rail={
						<MailFolderRail
							active={folder}
							onSelect={(id) => {
								setFolder(id);
								setActiveThreadId(null);
							}}
							onCompose={() => openCompose("new")}
							inboxUnread={inboxUnread}
						/>
					}
					list={
						<MailThreadList
							folder={folder}
							threads={visibleThreads}
							activeThreadId={activeThreadId}
							onSelect={setActiveThreadId}
							search={search}
							onSearchChange={setSearch}
							readFilter={readFilter}
							onReadFilterChange={setReadFilter}
							isLoading={threadsQuery.isLoading}
							searchRef={searchRef}
						/>
					}
					reader={
						<MailThreadReader
							thread={thread}
							messages={messages}
							expandedIds={expandedIds}
							onToggleMessage={toggleMessage}
							isLoading={threadQuery.isLoading}
							error={
								threadsQuery.isError
									? threadsQuery.error.message
									: threadQuery.isError
										? threadQuery.error.message
										: null
							}
							onRetry={() => {
								if (threadsQuery.isError) threadsQuery.refetch();
								if (threadQuery.isError) threadQuery.refetch();
							}}
							onReply={() => openCompose("reply")}
							onReplyAll={() => openCompose("replyAll")}
							onForward={() => openCompose("forward")}
							onArchive={notImplemented("Архивировать")}
							onTrash={notImplemented("Удалить")}
							onMarkUnread={markThreadUnread}
							onBack={() => setActiveThreadId(null)}
							composer={composerProps}
						/>
					}
				/>
			</div>
		</DashboardSurface>
	);
}
