import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardSurface } from "renderer/components/DashboardSurface";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { authClient } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import {
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
	type MailPlacement,
	type SavedDraft,
	toSavedDraft,
} from "./lib/mailStore";
import type { MailFolderId } from "./lib/mailTypes";
import { uploadDraftAttachments } from "./lib/uploadAttachments";
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
 *
 * SERVER-BACKED (FN-135/138/139/141, #697/#698/#699/#701): folder placement +
 * the ⭐ flag live on the `mail_threads` row (`mail.setFolder`/`mail.setFlag`);
 * the unread badge is the real `unreadCount` aggregate from `mail.listThreads`;
 * search hits the Postgres FTS `mail.search`; drafts persist via
 * `mail.saveDraft`/`listDrafts`/`deleteDraft`; attachments upload to R2 (presigned
 * PUT) before `mail.send`. Nothing in this surface uses localStorage anymore.
 *
 * Security invariants preserved: HTML bodies are DOMPurify-sanitized AND rendered
 * in a sandboxed iframe with remote images blocked by default; presigned R2 URLs
 * are never logged.
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
	const searchRef = useRef<HTMLInputElement>(null);
	// Holds the latest `openCompose` so the global Cmd+N listener (bound once)
	// always invokes the current closure without re-subscribing every render.
	const openComposeRef = useRef<(mode: ComposeMode) => void>(() => {});

	// Debounced search term → the FTS query is only run for a non-trivial term.
	const [debouncedSearch, setDebouncedSearch] = useState("");
	useEffect(() => {
		const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
		return () => clearTimeout(id);
	}, [search]);
	const isSearching = debouncedSearch.length > 0;

	// ---- Data ---------------------------------------------------------------
	const threadsQuery = useQuery(
		trpc.mail.listThreads.queryOptions({ limit: 100 }),
	);
	const allThreads = useMemo(
		() => threadsQuery.data ?? [],
		[threadsQuery.data],
	);

	// FN-138 (#698): server-side FTS. Active only while a query is present; its
	// results replace the folder feed (the rail still shows folder counts).
	const searchQuery = useQuery({
		...trpc.mail.search.queryOptions({ query: debouncedSearch, limit: 50 }),
		enabled: isSearching,
	});

	// FN-139 (#699): server-backed drafts.
	const draftsQuery = useQuery(trpc.mail.listDrafts.queryOptions());
	const drafts: SavedDraft[] = useMemo(
		() => (draftsQuery.data ?? []).map(toSavedDraft),
		[draftsQuery.data],
	);

	// Provision (or re-affirm) the caller's <handle>@rox.one mailbox so the
	// header can show the real sending address. Idempotent server-side.
	const provision = useMutation(
		trpc.mail.provisionAddress.mutationOptions({
			onError: (error) =>
				logger.error("[EmailView] provisionAddress failed", error),
		}),
	);
	const provisionMutate = provision.mutate;
	useEffect(() => {
		if (session?.user?.id) provisionMutate({});
	}, [session?.user?.id, provisionMutate]);
	const mailboxAddress = provision.data?.address ?? null;

	const visibleThreads = useMemo(() => {
		// While searching, the FTS results are the feed (already thread-rolled).
		if (isSearching) {
			const results = searchQuery.data ?? [];
			if (readFilter === "unread") {
				return results.filter((t) => t.unreadCount > 0);
			}
			return results;
		}
		const filtered = filterThreads(allThreads, folder);
		if (readFilter === "unread") {
			return filtered.filter((t) => t.unreadCount > 0);
		}
		return filtered;
	}, [isSearching, searchQuery.data, allThreads, folder, readFilter]);

	const counts = useMemo(
		() =>
			deriveMailCounts({
				threads: allThreads,
				draftCount: drafts.length,
			}),
		[allThreads, drafts.length],
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

	// ---- Mutations: invalidation helpers ------------------------------------
	const invalidateThread = async () => {
		if (!activeThreadId) return;
		await queryClient.invalidateQueries({
			queryKey: trpc.mail.getThread.queryKey({ threadId: activeThreadId }),
		});
	};
	const invalidateThreads = async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.mail.listThreads.queryKey({ limit: 100 }),
		});
	};
	const invalidateDrafts = async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.mail.listDrafts.queryKey(),
		});
	};

	const markRead = useMutation(
		trpc.mail.markRead.mutationOptions({
			onSuccess: async () => {
				await invalidateThread();
				await invalidateThreads();
			},
			onError: (error) => logger.error("[EmailView] markRead failed", error),
		}),
	);

	// FN-135 (#697): server folder placement + ⭐ flag.
	const setFolderM = useMutation(
		trpc.mail.setFolder.mutationOptions({
			onSuccess: invalidateThreads,
			onError: (error) => logger.error("[EmailView] setFolder failed", error),
		}),
	);
	const setFlagM = useMutation(
		trpc.mail.setFlag.mutationOptions({
			onSuccess: invalidateThreads,
			onError: (error) => logger.error("[EmailView] setFlag failed", error),
		}),
	);

	// FN-139 (#699): server drafts.
	const saveDraftM = useMutation(
		trpc.mail.saveDraft.mutationOptions({
			onSuccess: invalidateDrafts,
			onError: (error) => logger.error("[EmailView] saveDraft failed", error),
		}),
	);
	const deleteDraftM = useMutation(
		trpc.mail.deleteDraft.mutationOptions({
			onSuccess: invalidateDrafts,
			onError: (error) => logger.error("[EmailView] deleteDraft failed", error),
		}),
	);

	// FN-141 (#701): presign attachment uploads.
	const presignM = useMutation(
		trpc.mail.presignAttachmentUpload.mutationOptions(),
	);

	const send = useMutation(
		trpc.mail.send.mutationOptions({
			onSuccess: async () => {
				await invalidateThreads();
				await invalidateThread();
				// A sent draft is consumed (delete it server-side).
				if (activeDraftId) deleteDraftM.mutate({ id: activeDraftId });
				closeComposer();
				toast.success("Письмо отправлено");
			},
			onError: (error) => {
				logger.error("[EmailView] send failed", error);
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
		const replyThreadId =
			composeMode === "reply" || composeMode === "replyAll"
				? activeThreadId
				: null;
		saveDraftM.mutate(
			{
				id: activeDraftId ?? undefined,
				threadId: replyThreadId ?? undefined,
				to: draft.to,
				cc: draft.cc,
				bcc: draft.bcc,
				subject: draft.subject,
				body: draft.body,
				attachments: (draft.attachments ?? []).map((a) => ({
					filename: a.name,
					sizeBytes: a.size,
					contentType: a.contentType,
					blobKey: a.key,
				})),
			},
			{
				onSuccess: (row) => {
					if (row?.id) setActiveDraftId(row.id);
					toast.success("Черновик сохранён");
				},
			},
		);
	};

	const handleDeleteDraft = (id: string) => {
		deleteDraftM.mutate({ id });
		if (id === activeDraftId) closeComposer();
	};

	const handleSend = async () => {
		const to = parseRecipients(draft.to);
		const cc = parseRecipients(draft.cc);
		const bcc = parseRecipients(draft.bcc);
		if (to.length === 0 || !draft.body.trim()) return;

		// FN-141 (#701): upload any staged attachments to R2 (presigned PUT), then
		// pass their keys on send. A presigned PUT + direct R2 upload keeps bytes
		// off the tRPC request. Failure here aborts the send with a clear toast.
		let attachmentRefs: Awaited<ReturnType<typeof uploadDraftAttachments>> = [];
		if ((draft.attachments ?? []).length > 0) {
			try {
				attachmentRefs = await uploadDraftAttachments(
					draft.attachments ?? [],
					(input) => presignM.mutateAsync(input),
				);
			} catch (error) {
				logger.error("[EmailView] attachment upload failed", error);
				toast.error("Не удалось загрузить вложение");
				return;
			}
		}

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
			attachments: attachmentRefs.length ? attachmentRefs : undefined,
		});
	};

	// ---- Folder/flag actions (server mutations) -----------------------------
	const place = (id: string, target: MailPlacement, label: string) => {
		setFolderM.mutate({ threadId: id, folder: target });
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
		setFolderM.mutate({ threadId: id, folder: "inbox" });
		toast.success("Возвращено во входящие");
	};
	const toggleStar = (id: string) => setFlagM.mutate({ threadId: id });

	// Toggle read/unread on a thread's inbound messages (real markRead).
	const toggleThreadRead = (id: string) => {
		if (id !== activeThreadId) return;
		const anyUnread = messages.some(
			(m) => m.direction === "inbound" && !m.isRead,
		);
		for (const m of messages) {
			if (m.direction === "inbound") {
				markRead.mutate({ messageId: m.id, isRead: anyUnread });
			}
		}
	};

	const markThreadUnread = () => {
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
	const bulkArchive = () =>
		bulkApply((id) => setFolderM.mutate({ threadId: id, folder: "archive" }));
	const bulkTrash = () =>
		bulkApply((id) => setFolderM.mutate({ threadId: id, folder: "trash" }));
	const bulkRead = () =>
		bulkApply((id) => {
			// Mark the open thread's inbound messages read; others are invalidated by
			// the listThreads refetch the folder mutation triggers elsewhere.
			if (id === activeThreadId) {
				for (const m of messages) {
					if (m.direction === "inbound" && !m.isRead) {
						markRead.mutate({ messageId: m.id, isRead: true });
					}
				}
			}
		});

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
					sending: send.isPending || presignM.isPending,
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
		? Boolean(
				(isSearching ? searchQuery.data : allThreads)?.find(
					(t) => t.id === activeThreadId,
				)?.isFlagged,
			)
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
						folder === "drafts" && !isSearching ? (
							<MailDraftsList
								drafts={drafts}
								onOpen={openSavedDraft}
								onDelete={handleDeleteDraft}
							/>
						) : (
							<MailThreadList
								folder={folder}
								threads={visibleThreads}
								activeThreadId={activeThreadId}
								onSelect={setActiveThreadId}
								readFilter={readFilter}
								onReadFilterChange={setReadFilter}
								isLoading={
									isSearching ? searchQuery.isLoading : threadsQuery.isLoading
								}
								flagged={Object.fromEntries(
									visibleThreads
										.filter((t) => t.isFlagged)
										.map((t) => [t.id, true as const]),
								)}
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
