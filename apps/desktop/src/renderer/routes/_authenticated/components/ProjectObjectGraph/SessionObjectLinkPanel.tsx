import type { EntityKind } from "@rox/db/enums";
import {
	mapSessionLinks,
	SESSION_LINK_RELATIONS,
	type SessionLinkRelation,
	sessionEntityEnsureInput,
	sessionLinkInput,
	sessionLinkKindLabel,
	sessionLinkRelationLabel,
} from "@rox/shared/session-object-link";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { LuLink2, LuSearch } from "react-icons/lu";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";

/** Min query length before a target search fires (matches `graphSearchSchema.query.min(1)`). */
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/** The Project-OS object kinds a session can be linked to (parity with the web surface). */
const TARGET_KINDS = [
	"note",
	"task",
	"project",
	"contact",
	"feed",
	"file",
] as const satisfies readonly EntityKind[];

interface PickedTarget {
	entityId: string;
	slug: string | null;
	kind: EntityKind;
	title: string;
}

export interface SessionObjectLinkPanelProps {
	/** The chat session this control links to a Project-OS object. */
	sessionId: string;
	/** Optional session title used for the session graph node label. */
	sessionTitle?: string | null;
	/** Optional fallback rendered when the gate is closed (OFF = absent). */
	fallback?: React.ReactNode;
}

/**
 * Desktop parity for `projectOs.objectLinkedChat` — a gated control that links
 * THIS chat session to a Project-OS object and reads back the session's existing
 * links, entirely over the shipped graph router (no new procedure, no migration):
 *   - ensures the session's `agent_session` graph node on mount via
 *     `graph.create` (idempotent on a deterministic key → true get-or-create),
 *   - finds a target object with a debounced `graph.search` over the addressable
 *     kinds (the same shipped search the desktop unified-search surface uses),
 *   - links session→target with `graph.link` (relation `about`/`references`), and
 *   - lists the session's outgoing links via `graph.neighbors` + the REUSED pure
 *     `mapSessionLinks` (`@rox/shared/session-object-link`).
 *
 * Ports `apps/web/.../(agents)/agents/sessions/components/SessionObjectLink/SessionObjectLinkPanel.tsx`
 * and reuses the SAME pure mapper + the same shipped `graph.*` tRPC procedures the
 * desktop ProjectObjectGraph shell already calls (via {@link useTRPC}). No new
 * query, no migration, no flag flip — this is the gated desktop surface.
 *
 * Mounted only when {@link ExperimentalFeatureGate} opens for
 * `projectOs.objectLinkedChat`; OFF means the surface is absent (no regression).
 * All write/read paths are org-membership gated server-side
 * (`requireActiveOrgMembership`).
 */
export function SessionObjectLinkPanel({
	sessionId,
	sessionTitle,
	fallback = null,
}: SessionObjectLinkPanelProps) {
	return (
		<ExperimentalFeatureGate
			featureId="projectOs.objectLinkedChat"
			fallback={fallback}
		>
			<SessionObjectLinkSurface
				sessionId={sessionId}
				sessionTitle={sessionTitle}
			/>
		</ExperimentalFeatureGate>
	);
}

/**
 * The live surface, mounted only once the gate resolves `available`. Exported so
 * a host that has ALREADY resolved the gate (e.g. {@link SessionObjectLinkLauncher}
 * rendering it inside a dialog) can embed it without re-gating.
 */
export function SessionObjectLinkSurface({
	sessionId,
	sessionTitle,
}: {
	sessionId: string;
	sessionTitle?: string | null;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [sessionEntityId, setSessionEntityId] = useState<string | null>(null);
	const [rawQuery, setRawQuery] = useState("");
	const [picked, setPicked] = useState<PickedTarget | null>(null);
	const [relation, setRelation] = useState<SessionLinkRelation>("about");

	const query = useDebouncedValue(rawQuery.trim(), DEBOUNCE_MS);
	const searchEnabled = query.length >= MIN_QUERY_LENGTH;

	// Ensure the session graph node exists (get-or-create). Runs once per session
	// id; the deterministic idempotency key makes a replay return the same node.
	const ensureMutation = useMutation(
		trpc.graph.create.mutationOptions({
			onSuccess: (entity) => setSessionEntityId(entity.id),
			onError: (error) =>
				toast.error(error.message || "Не удалось подготовить узел сессии"),
		}),
	);
	const ensureMutate = ensureMutation.mutate;
	// biome-ignore lint/correctness/useExhaustiveDependencies: ensure exactly once per session id
	useEffect(() => {
		setSessionEntityId(null);
		ensureMutate(sessionEntityEnsureInput(sessionId, sessionTitle));
	}, [sessionId, sessionTitle]);

	const searchQuery = useQuery({
		...trpc.graph.search.queryOptions({
			query,
			kinds: [...TARGET_KINDS],
			mode: "semantic",
			status: "active",
			limit: 15,
		}),
		enabled: searchEnabled,
		placeholderData: (previous) => previous,
	});

	const neighborsQuery = useQuery({
		...trpc.graph.neighbors.queryOptions({
			entityId: sessionEntityId ?? "",
			depth: 1,
			relations: [...SESSION_LINK_RELATIONS],
			limit: 200,
		}),
		enabled: sessionEntityId !== null,
	});

	const links = useMemo(
		() =>
			sessionEntityId && neighborsQuery.data
				? mapSessionLinks(sessionEntityId, neighborsQuery.data)
				: [],
		[sessionEntityId, neighborsQuery.data],
	);

	const linkMutation = useMutation(
		trpc.graph.link.mutationOptions({
			onSuccess: async () => {
				toast.success("Сессия привязана к объекту");
				setPicked(null);
				setRawQuery("");
				if (sessionEntityId) {
					await queryClient.invalidateQueries({
						queryKey: trpc.graph.neighbors.queryKey({
							entityId: sessionEntityId,
							depth: 1,
							relations: [...SESSION_LINK_RELATIONS],
							limit: 200,
						}),
					});
				}
			},
			onError: (error) =>
				toast.error(error.message || "Не удалось привязать сессию"),
		}),
	);

	const handleLink = () => {
		if (!sessionEntityId || !picked) return;
		linkMutation.mutate(
			sessionLinkInput({
				sessionEntityId,
				target: { entityId: picked.entityId, slug: picked.slug },
				relation,
				idempotencyKey: crypto.randomUUID(),
			}),
		);
	};

	const preparing = sessionEntityId === null;
	const hits = searchQuery.data?.hits ?? [];

	return (
		<section className="space-y-4" aria-label="Связать сессию с объектом">
			<header className="flex items-center gap-2">
				<LuLink2 className="size-4 text-muted-foreground" />
				<div className="min-w-0">
					<h2 className="font-semibold text-sm uppercase tracking-[0.14em] text-muted-foreground">
						Связать с объектом
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Привяжите эту сессию к задаче, заметке или другому объекту проекта,
						чтобы переписка стала переиспользуемым контекстом.
					</p>
				</div>
			</header>

			{/* Target picker */}
			<div className="space-y-2">
				<div className="relative">
					<LuSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
					<Input
						type="search"
						value={picked ? picked.title : rawQuery}
						onChange={(event) => {
							setPicked(null);
							setRawQuery(event.target.value);
						}}
						placeholder="Найдите объект для связи…"
						aria-label="Поиск объекта для связи"
						className="pl-9"
						disabled={preparing}
					/>
				</div>

				{!picked && searchEnabled ? (
					<TargetResults
						isSearching={searchQuery.isFetching}
						isError={searchQuery.isError}
						hits={hits}
						onPick={setPicked}
					/>
				) : null}
			</div>

			{/* Relation + link action */}
			<div className="flex flex-wrap items-center gap-2">
				<Select
					value={relation}
					onValueChange={(value) => {
						if (value === "about" || value === "references") {
							setRelation(value);
						}
					}}
				>
					<SelectTrigger className="w-44" aria-label="Тип связи">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{SESSION_LINK_RELATIONS.map((value) => (
							<SelectItem key={value} value={value}>
								{sessionLinkRelationLabel(value)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Button
					type="button"
					onClick={handleLink}
					disabled={preparing || !picked || linkMutation.isPending}
				>
					{linkMutation.isPending ? "Связывание…" : "Связать"}
				</Button>

				{preparing ? (
					<span className="text-muted-foreground text-xs">
						Подготовка узла сессии…
					</span>
				) : null}
			</div>

			{/* Existing links readout */}
			<SessionLinksReadout
				isLoading={!preparing && neighborsQuery.isLoading}
				links={links}
			/>
		</section>
	);
}

function TargetResults({
	isSearching,
	isError,
	hits,
	onPick,
}: {
	isSearching: boolean;
	isError: boolean;
	hits: ReadonlyArray<{
		id: string;
		kind: EntityKind;
		slug: string | null;
		title: string;
	}>;
	onPick: (target: PickedTarget) => void;
}) {
	if (isError) {
		return (
			<p className="rounded-md border border-destructive/40 p-3 text-destructive text-sm">
				Не удалось выполнить поиск объектов.
			</p>
		);
	}
	if (hits.length === 0 && isSearching) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-10 w-full rounded-md" />
				<Skeleton className="h-10 w-full rounded-md" />
			</div>
		);
	}
	if (hits.length === 0) {
		return (
			<p className="rounded-md border border-dashed p-3 text-center text-muted-foreground text-sm">
				Ничего не найдено.
			</p>
		);
	}
	return (
		<ul className="divide-y rounded-md border">
			{hits.map((hit) => (
				<li key={hit.id}>
					<button
						type="button"
						onClick={() =>
							onPick({
								entityId: hit.id,
								slug: hit.slug,
								kind: hit.kind,
								title: hit.title,
							})
						}
						className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-accent"
					>
						<span className="truncate font-medium text-sm">{hit.title}</span>
						<Badge variant="outline">{sessionLinkKindLabel(hit.kind)}</Badge>
					</button>
				</li>
			))}
		</ul>
	);
}

function SessionLinksReadout({
	isLoading,
	links,
}: {
	isLoading: boolean;
	links: ReturnType<typeof mapSessionLinks>;
}) {
	return (
		<div className="space-y-2">
			<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]">
				Текущие связи сессии
			</h3>
			{isLoading ? (
				<Skeleton className="h-10 w-full rounded-md" />
			) : links.length === 0 ? (
				<p className="rounded-md border border-dashed p-3 text-center text-muted-foreground text-sm">
					Пока нет связей. Найдите объект выше и нажмите «Связать».
				</p>
			) : (
				<ul className="divide-y rounded-md border">
					{links.map((row) => (
						<li
							key={row.edgeId}
							className="flex flex-wrap items-center gap-2 p-3 text-sm"
						>
							<Badge variant="secondary">{row.relationLabel}</Badge>
							<span className="truncate font-medium">{row.targetTitle}</span>
							{row.targetKind ? (
								<Badge variant="outline">
									{sessionLinkKindLabel(row.targetKind)}
								</Badge>
							) : null}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
