import {
	type ContactCardViewModel,
	type ContactListItemInput,
	mapContactCards,
	mapContactLinks,
} from "@rox/shared/crm-contacts";
import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Badge } from "@rox/ui/badge";
import { Skeleton } from "@rox/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LuMail, LuUsers } from "react-icons/lu";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";

/** Relations that connect a contact to the objects around it (depth-1 neighbors). */
const CONTACT_LINK_RELATIONS = [
	"authored_by",
	"mentions",
	"participant_of",
	"about",
	"references",
] as const;

const PAGE_LIMIT = 50;

export interface CrmContactsPanelProps {
	/** Optional fallback rendered when the gate is closed (OFF = absent). */
	fallback?: React.ReactNode;
}

/**
 * Desktop parity for `projectOs.crmContacts` — a gated CRM contacts surface over
 * the native Rox object graph. Lists the org's `kind=contact` nodes joined to
 * their 1:1 `contacts` detail via the shipped read-only `graph.listContacts`
 * (rendered through the REUSED `mapContactCards`), and on selecting a contact
 * shows the objects it links to read back through the shipped `graph.neighbors`
 * (rendered through the REUSED `mapContactLinks`).
 *
 * Ports `apps/web/.../(agents)/agents/contacts/CrmContactsPanel.tsx` and reuses
 * the same pure mappers (`@rox/shared/crm-contacts`) + the same shipped graph
 * queries the desktop ProjectObjectGraph shell already calls. No new query, no
 * migration, no flag flip — this is the gated desktop surface.
 *
 * Mounted only when {@link ExperimentalFeatureGate} opens for
 * `projectOs.crmContacts`; OFF means the surface is absent (no regression).
 */
export function CrmContactsPanel({ fallback = null }: CrmContactsPanelProps) {
	return (
		<ExperimentalFeatureGate
			featureId="projectOs.crmContacts"
			fallback={fallback}
		>
			<CrmContactsSurface />
		</ExperimentalFeatureGate>
	);
}

/** The live surface, mounted only once the gate resolves `available`. */
function CrmContactsSurface() {
	const trpc = useTRPC();
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const contactsQuery = useQuery(
		trpc.graph.listContacts.queryOptions({
			status: "active",
			limit: PAGE_LIMIT,
		}),
	);

	const cards = useMemo(
		() =>
			mapContactCards(
				(contactsQuery.data?.items ?? []) as ContactListItemInput[],
			),
		[contactsQuery.data],
	);

	const selected = useMemo(
		() => cards.find((card) => card.entityId === selectedId) ?? null,
		[cards, selectedId],
	);

	return (
		<section className="space-y-4" aria-label="Контакты">
			<div className="flex items-center gap-2">
				<LuUsers className="size-5 text-muted-foreground" />
				<div>
					<h2 className="font-semibold text-lg">Контакты</h2>
					<p className="text-muted-foreground text-sm">
						Клиенты и стейкхолдеры как объекты графа — со связями на звонки,
						заметки, задачи и проекты.
					</p>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<ContactsList
					isLoading={contactsQuery.isLoading}
					isError={contactsQuery.isError}
					cards={cards}
					selectedId={selectedId}
					onSelect={setSelectedId}
					onRetry={() => void contactsQuery.refetch()}
				/>
				<ContactDetail contact={selected} relations={CONTACT_LINK_RELATIONS} />
			</div>
		</section>
	);
}

function ContactsList({
	isLoading,
	isError,
	cards,
	selectedId,
	onSelect,
	onRetry,
}: {
	isLoading: boolean;
	isError: boolean;
	cards: ContactCardViewModel[];
	selectedId: string | null;
	onSelect: (entityId: string) => void;
	onRetry: () => void;
}) {
	if (isError) {
		return (
			<div className="rounded-lg border border-destructive/40 p-4 text-sm">
				<p className="text-destructive">Не удалось загрузить контакты.</p>
				<button
					type="button"
					onClick={onRetry}
					className="mt-2 text-muted-foreground underline underline-offset-4 hover:text-foreground"
				>
					Повторить
				</button>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-16 w-full rounded-lg" />
				<Skeleton className="h-16 w-full rounded-lg" />
				<Skeleton className="h-16 w-full rounded-lg" />
			</div>
		);
	}

	if (cards.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Контактов пока нет. Они появляются здесь, когда граф распознаёт людей в
				письмах, звонках и упоминаниях.
			</p>
		);
	}

	return (
		<ul className="divide-y rounded-lg border">
			{cards.map((card) => (
				<li key={card.entityId}>
					<button
						type="button"
						onClick={() => onSelect(card.entityId)}
						aria-pressed={card.entityId === selectedId}
						className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent ${
							card.entityId === selectedId ? "bg-accent" : ""
						}`}
					>
						<Avatar className="size-9 shrink-0">
							{card.avatarUrl ? (
								<AvatarImage src={card.avatarUrl} alt="" />
							) : null}
							<AvatarFallback>{card.initials}</AvatarFallback>
						</Avatar>
						<span className="min-w-0 flex-1">
							<span className="flex items-center gap-2">
								<span className="truncate font-medium text-sm">
									{card.name}
								</span>
								{card.isSelf ? <Badge variant="secondary">Вы</Badge> : null}
							</span>
							{card.subtitle ? (
								<span className="mt-0.5 block truncate text-muted-foreground text-xs">
									{card.subtitle}
								</span>
							) : null}
						</span>
					</button>
				</li>
			))}
		</ul>
	);
}

function ContactDetail({
	contact,
	relations,
}: {
	contact: ContactCardViewModel | null;
	relations: readonly string[];
}) {
	if (!contact) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Выберите контакт, чтобы увидеть его связи с объектами проекта.
			</div>
		);
	}

	return (
		<section className="space-y-4 rounded-lg border bg-card p-5">
			<header className="flex items-center gap-3">
				<Avatar className="size-12 shrink-0">
					{contact.avatarUrl ? (
						<AvatarImage src={contact.avatarUrl} alt="" />
					) : null}
					<AvatarFallback>{contact.initials}</AvatarFallback>
				</Avatar>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h3 className="truncate font-semibold">{contact.name}</h3>
						{contact.isSelf ? <Badge variant="secondary">Вы</Badge> : null}
					</div>
					{contact.email ? (
						<a
							href={contact.mailtoHref ?? undefined}
							className="mt-0.5 flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
						>
							<LuMail className="size-3.5" />
							<span className="truncate">{contact.email}</span>
						</a>
					) : null}
				</div>
			</header>

			<ContactLinks entityId={contact.entityId} relations={relations} />
		</section>
	);
}

function ContactLinks({
	entityId,
	relations,
}: {
	entityId: string;
	relations: readonly string[];
}) {
	const trpc = useTRPC();
	const neighborsQuery = useQuery(
		trpc.graph.neighbors.queryOptions({
			entityId,
			depth: 1,
			// biome-ignore lint/suspicious/noExplicitAny: relation enum narrowed at the router
			relations: relations as any,
			limit: 200,
		}),
	);

	const links = useMemo(
		() =>
			neighborsQuery.data
				? mapContactLinks({
						contactEntityId: entityId,
						nodes: neighborsQuery.data.nodes,
						edges: neighborsQuery.data.edges,
					})
				: [],
		[entityId, neighborsQuery.data],
	);

	return (
		<div className="space-y-2">
			<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]">
				Связанные объекты
			</h4>
			{neighborsQuery.isLoading ? (
				<Skeleton className="h-10 w-full rounded-md" />
			) : neighborsQuery.isError ? (
				<p className="rounded-md border border-destructive/40 p-3 text-destructive text-sm">
					Не удалось загрузить связи контакта.
				</p>
			) : links.length === 0 ? (
				<p className="rounded-md border border-dashed p-3 text-center text-muted-foreground text-sm">
					У этого контакта пока нет связей с объектами проекта.
				</p>
			) : (
				<ul className="divide-y rounded-md border">
					{links.map((link) => (
						<li
							key={`${link.entityId}:${link.relationLabel}`}
							className="flex flex-wrap items-center gap-2 p-3 text-sm"
						>
							<Badge variant="secondary">{link.relationLabel}</Badge>
							{link.href ? (
								<a
									href={link.href}
									className="truncate font-medium hover:underline"
								>
									{link.title}
								</a>
							) : (
								<span className="truncate font-medium">{link.title}</span>
							)}
							<Badge variant="outline">{link.kindLabel}</Badge>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
