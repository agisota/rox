import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardSurface } from "renderer/components/DashboardSurface";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { authClient } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import {
	type DraftAttachment,
	EMPTY_DRAFT,
	type MailDraft,
	parseRecipients,
} from "./components/MailComposer";
import { MailDraftsList } from "./components/MailDraftsList";
import { MailFolderRail } from "./components/MailFolderRail";
import { MailHeader } from "./components/MailHeader";
import { MailShell } from "./components/MailShell";
import {
	type MailReadFilter,
	MailThreadList,
} from "./components/MailThreadList";
import { MailThreadReader } from "./components/MailThreadReader";
import { filterThreads } from "./lib/filterThreads";
import { deriveMailCounts } from "./lib/mailCounts";
import { messagePreview } from "./lib/mailFormat";
import {
	buildForwardSubject,
	buildMailReplyContext,
} from "./lib/mailReplyContext";
import {
	clearPlacement,
	deleteDraft,
	type MailPlacement,
	newDraftId,
	type SavedDraft,
	setPlacement,
	toggleFlag,
	upsertDraft,
	useMailDrafts,
	useMailFlags,
	useMailPlacements,
} from "./lib/mailStore";
import type { MailFolderId } from "./lib/mailTypes";
import { useMailKeyboard } from "./lib/useMailKeyboard";

/** What the inline composer is currently doing (drives prefill + title). */
type ComposeMode = "new" | "reply" | "replyAll" | "forward";

/**
 * Mail surface — a full-width email client: an always-visible header (identity +
 * counts + search + Написать) over a three-pane body (rail | virtualized list |
 * reader + inline composer) on the real `mail.*` contract.
 *
 * Standalone (`/email`) it owns its own folder + selection state; embedded in
 * `InboxView` the open thread is lifted via {@link EmailViewProps} so live SSE
 * there can invalidate `mail.getThread`. Either way it renders inside
 * `<DashboardSurface width="full" bare>` — no `max-w` cap, no centered gutter.
 *
 * IDENTITY: the account email is read from `authClient.useSession()`; the
 * routable `<handle>@rox.one` mailbox from `mail.provisionAddress` (idempotent).
 * Both flow into {@link MailHeader}. Server-side every mail procedure already
 * keys off `ctx.session.user.id`, so ownership needs no extra wiring.
 *
 * FOLDER/FLAG/DRAFT state the server cannot yet persist (archive/trash/spam,
 * the ⭐ flag, drafts — recon gaps #1/#2/#6) is modeled in the local
 * {@link useMailPlacements}/{@link useMailFlags}/{@link useMailDrafts} store; each
 * write is the exact seam a future `mail.*` mutation replaces. Read/list/send/
 * markRead all hit the REAL procedures.
 *
 * Security invariants preserved: HTML bodies are DOMPurify-sanitized AND
 * rendered in a sandboxed iframe with remote images blocked by default
 * (`MailHtmlContent`); presigned R2 URLs are never logged.
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
	const { data: session } = authClient.useSession();

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
	const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
	const [outboundDisabled, setOutboundDisabled] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	// Thread ids opened this session — drives the best-effort unread signal until
	// the server exposes a real unread aggregate (mailCounts caveat).
	const [openedThreadIds, setOpenedThreadIds] = useState<Set<string>>(
		new Set(),
	);
	const searchRef = useRef<HTMLInputElement>(null);
	// Holds the latest `openCompose` so the global Cmd+N listener (bound once)
	// always invokes the current closure without re-subscribing every render.
	const openComposeRef = useRef<(mode: ComposeMode) => void>(() => {});

	// ---- Local organization store (folder/flag/draft seams) -----------------
	const placement = useMailPlacements();
	const flagged = useMailFlags();
	const drafts = useMailDrafts();

	// ---- Data ---------------------------------------------------------------
	const threadsQuery = useQuery(
		trpc.mail.listThreads.queryOptions({ limit: 100 }),
	);
	const allThreads = useMemo(
		() => threadsQuery.data ?? [],
		[threadsQuery.data],
	);

	// Provision (or re-affirm) the caller's <handle>@rox.one mailbox so the
	// header can show the real sending address. Idempotent server-side; runs once
	// when a session is present. Failures are non-fatal (header falls back to the
	// account email).
	const provision = useMutation(
		trpc.mail.provisionAddress.mutationOptions({
			onError: (error) =>
				logger.error("[EmailView] provisionAddress failed", error),
		}),
	);
	const provisionMutate = provision.mutate;
	// Provision once a session id is known; idempotent server-side so re-fires are
	// safe. Deps are exhaustive (id + the stable mutate fn) — no suppression needed.
	useEffect(() => {
		if (session?.user?.id) provisionMutate({});
	}, [session?.user?.id, provisionMutate]);
	const mailboxAddress = provision.data?.address ?? null;

	const visibleThreads = useMemo(() => {
		const filtered = filterThreads(allThreads, folder, search, {
			placement,
			flagged,
			openedThreadIds,
		});
		if (readFilter === "unread") {
			return filtered.filter(
				(t) => !openedThreadIds.has(t.id) && t.messageCount > 1,
			);
		}
		return filtered;
	}, [
		allThreads,
		folder,
		search,
		placement,
		flagged,
		openedThreadIds,
		readFilter,
	]);

	const counts = useMemo(
		() =>
			deriveMailCounts({
				threads: allThreads,
				placement,
				flagged,
				openedThreadIds,
				draftCount: drafts.length,
			}),
		[allThreads, placement, flagged, openedThreadIds, drafts.length],
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
				// A sent draft is consumed.
				if (activeDraftId) deleteDraft(activeDraftId);
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
		// Mark this thread as opened for the unread heuristic.
		setOpenedThreadIds((prev) => {
			if (prev.has(activeThreadId)) return prev;
			const next = new Set(prev);
			next.add(activeThreadId);
			return next;
		});
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
		setActiveDraftId(null);
	};

	const openCompose = (mode: ComposeMode) => {
		if (mode === "new") {
			setDraft(EMPTY_DRAFT);
			setActiveDraftId(null);
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
				attachments: [],
			});
		}
		setActiveDraftId(null);
		setComposeMode(mode);
	};

	// Re-open a persisted draft back into the composer (Черновики folder).
	const openSavedDraft = (saved: SavedDraft) => {
		setDraft({
			to: saved.to,
			cc: saved.cc,
			bcc: saved.bcc,
			subject: saved.subject,
			body: saved.body,
			attachments: saved.attachments ?? [],
		});
		setActiveDraftId(saved.id);
		if (saved.threadId) setActiveThreadId(saved.threadId);
		setComposeMode(saved.threadId ? "reply" : "new");
	};

	const handleSaveDraft = () => {
		const id = activeDraftId ?? newDraftId();
		const saved: SavedDraft = {
			id,
			threadId:
				composeMode === "reply" || composeMode === "replyAll"
					? activeThreadId
					: null,
			to: draft.to,
			cc: draft.cc,
			bcc: draft.bcc,
			subject: draft.subject,
			body: draft.body,
			attachments: draft.attachments as DraftAttachment[] | undefined,
			updatedAt: Date.now(),
		};
		upsertDraft(saved);
		setActiveDraftId(id);
		toast.success("Черновик сохранён");
	};

	const handleSend = () => {
		const to = parseRecipients(draft.to);
		const cc = parseRecipients(draft.cc);
		const bcc = parseRecipients(draft.bcc);
		if (to.length === 0 || !draft.body.trim()) return;

		// TODO(server): upload `draft.attachments` to R2 (presigned PUT) and pass
		// their keys here once `sendSchema` accepts attachments. Staged files are
		// not yet transmitted.

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

	// ---- Folder/flag actions (local store seams) ----------------------------
	const place = (id: string, target: MailPlacement, label: string) => {
		setPlacement(id, target);
		if (id === activeThreadId) setActiveThreadId(null);
		setSelected((prev) => {
			if (!prev.has(id)) return prev;
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
		toast.success(label);
	};
	const archiveThread = (id: string) => place(id, "archive", "В архиве");
	const trashThread = (id: string) => place(id, "trash", "В корзине");
	const spamThread = (id: string) => place(id, "spam", "Отмечено как спам");
	const restoreThread = (id: string) => {
		clearPlacement(id);
		toast.success("Возвращено во входящие");
	};
	const toggleStar = (id: string) => toggleFlag(id);

	// Toggle read/unread on a thread's last inbound message (real markRead).
	const toggleThreadRead = (id: string) => {
		// We only have message-level read state; flip the opened heuristic locally
		// AND fire markRead on the thread's messages when it is the open thread.
		setOpenedThreadIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
		if (id === activeThreadId) {
			const wasOpened = openedThreadIds.has(id);
			for (const m of messages) {
				if (m.direction === "inbound") {
					markRead.mutate({ messageId: m.id, isRead: wasOpened });
				}
			}
		}
	};

	const markThreadUnread = () => {
		if (activeThreadId) {
			setOpenedThreadIds((prev) => {
				const next = new Set(prev);
				next.delete(activeThreadId);
				return next;
			});
		}
		const lastInbound = [...messages]
			.reverse()
			.find((m) => m.direction === "inbound");
		if (lastInbound) {
			markRead.mutate({ messageId: lastInbound.id, isRead: false });
		}
	};

	// ---- Multi-select -------------------------------------------------------
	const toggleSelect = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};
	const clearSelection = () => setSelected(new Set());
	const selectAll = () => setSelected(new Set(visibleThreads.map((t) => t.id)));

	const bulkApply = (fn: (id: string) => void) => {
		for (const id of selected) fn(id);
		clearSelection();
	};
	const bulkArchive = () => bulkApply((id) => setPlacement(id, "archive"));
	const bulkTrash = () => bulkApply((id) => setPlacement(id, "trash"));
	const bulkRead = () =>
		bulkApply((id) =>
			setOpenedThreadIds((prev) => {
				const next = new Set(prev);
				next.add(id);
				return next;
			}),
		);

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
			onArchive: () => {
				if (activeThreadId) archiveThread(activeThreadId);
			},
			onTrash: () => {
				if (activeThreadId) trashThread(activeThreadId);
			},
			onSearch: () => searchRef.current?.focus(),
			onCompose: () => openCompose("new"),
		},
		// Disable nav while typing in the composer to avoid hijacking keys.
		composeMode === null,
	);

	// Keep the ref pointed at the freshest closure (cheap, runs every render).
	openComposeRef.current = openCompose;

	// Cmd+N → compose (mirrors the header CTA + macOS new-message convention).
	// Bound once; the handler dereferences `openComposeRef` so it never goes stale
	// yet never re-subscribes (no changing deps → no churn on every keystroke).
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
				e.preventDefault();
				openComposeRef.current("new");
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	// ---- Toggle one message's expanded state --------------------------------
	const toggleMessage = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const composerProps =
		composeMode !== null
			? {
					draft,
					onChange: setDraft,
					onSend: handleSend,
					onCancel: closeComposer,
					onSaveDraft: handleSaveDraft,
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

	const activeThreadStarred = activeThreadId
		? Boolean(flagged[activeThreadId])
		: false;

	return (
		<DashboardSurface width="full" bare>
			<div className="h-full min-h-0">
				<MailShell
					header={
						<MailHeader
							accountEmail={session?.user?.email ?? null}
							accountName={session?.user?.name ?? null}
							mailboxAddress={mailboxAddress}
							total={counts.total}
							unread={counts.totalUnread}
							search={search}
							onSearchChange={setSearch}
							searchRef={searchRef}
							onCompose={() => openCompose("new")}
						/>
					}
					rail={
						<MailFolderRail
							active={folder}
							onSelect={(id) => {
								setFolder(id);
								setActiveThreadId(null);
								clearSelection();
							}}
							onCompose={() => openCompose("new")}
							counts={counts.byFolder}
						/>
					}
					list={
						folder === "drafts" ? (
							<MailDraftsList
								drafts={drafts}
								onOpen={openSavedDraft}
								onDelete={deleteDraft}
							/>
						) : (
							<MailThreadList
								folder={folder}
								threads={visibleThreads}
								activeThreadId={activeThreadId}
								onSelect={setActiveThreadId}
								readFilter={readFilter}
								onReadFilterChange={setReadFilter}
								isLoading={threadsQuery.isLoading}
								openedThreadIds={openedThreadIds}
								flagged={flagged}
								selected={selected}
								onToggleSelect={toggleSelect}
								onClearSelection={clearSelection}
								onSelectAll={selectAll}
								onBulkArchive={bulkArchive}
								onBulkTrash={bulkTrash}
								onBulkRead={bulkRead}
								actions={{
									onArchive: archiveThread,
									onTrash: trashThread,
									onRestore: restoreThread,
									onToggleRead: toggleThreadRead,
									onToggleStar: toggleStar,
								}}
							/>
						)
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
							onArchive={() => {
								if (activeThreadId) archiveThread(activeThreadId);
							}}
							onTrash={() => {
								if (activeThreadId) trashThread(activeThreadId);
							}}
							onSpam={() => {
								if (activeThreadId) spamThread(activeThreadId);
							}}
							onToggleStar={() => {
								if (activeThreadId) toggleStar(activeThreadId);
							}}
							onMarkUnread={markThreadUnread}
							onBack={() => setActiveThreadId(null)}
							starred={activeThreadStarred}
							composer={composerProps}
						/>
					}
				/>
			</div>
		</DashboardSurface>
	);
}
