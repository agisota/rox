import type { EdgeRelation } from "@rox/db/enums";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Separator } from "@rox/ui/separator";
import { cn } from "@rox/ui/utils";
import { LuArrowLeft, LuArrowRight, LuLink, LuShare2 } from "react-icons/lu";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { CommentsSection } from "./CommentsSection";
import { entityKindLabel, relationLabel } from "./relations";

/** A node in the project object graph (mirror of graph.projectGraph output). */
export interface ObjectGraphNode {
	entityId: string;
	kind: string;
	title: string;
	slug: string | null;
	inProject: boolean;
}

/** A resolved edge in the project object graph. */
export interface ObjectGraphEdge {
	id: string;
	sourceEntityId: string;
	targetEntityId: string | null;
	relation: EdgeRelation;
	resolved: boolean;
}

export interface LinkedObject {
	edgeId: string;
	relation: EdgeRelation;
	node: ObjectGraphNode | null;
	/** The id of the other endpoint, even when its node was not surfaced. */
	otherEntityId: string | null;
}

/**
 * Split the edges incident to `focusId` into outgoing (focus is the source) and
 * incoming (focus is the target) linked objects, resolving the other endpoint to
 * a known node where possible. Pure — exported for unit tests.
 */
export function splitLinkedObjects(
	focusId: string,
	nodes: readonly ObjectGraphNode[],
	edges: readonly ObjectGraphEdge[],
): { outgoing: LinkedObject[]; incoming: LinkedObject[] } {
	const byId = new Map(nodes.map((n) => [n.entityId, n]));
	const outgoing: LinkedObject[] = [];
	const incoming: LinkedObject[] = [];

	for (const edge of edges) {
		if (edge.sourceEntityId === focusId) {
			outgoing.push({
				edgeId: edge.id,
				relation: edge.relation,
				node: edge.targetEntityId
					? (byId.get(edge.targetEntityId) ?? null)
					: null,
				otherEntityId: edge.targetEntityId,
			});
		}
		if (edge.targetEntityId === focusId) {
			incoming.push({
				edgeId: edge.id,
				relation: edge.relation,
				node: byId.get(edge.sourceEntityId) ?? null,
				otherEntityId: edge.sourceEntityId,
			});
		}
	}

	return { outgoing, incoming };
}

interface LinkedObjectRowProps {
	direction: "outgoing" | "incoming";
	item: LinkedObject;
	onOpen?: (entityId: string) => void;
}

function LinkedObjectRow({ direction, item, onOpen }: LinkedObjectRowProps) {
	const DirectionIcon = direction === "outgoing" ? LuArrowRight : LuArrowLeft;
	const title = item.node?.title ?? "Неизвестный объект";
	const openable = Boolean(item.node && onOpen);

	return (
		<li>
			<button
				type="button"
				disabled={!openable}
				onClick={() => item.node && onOpen?.(item.node.entityId)}
				className={cn(
					"flex w-full items-center gap-2 rounded-md border border-border/50 px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
					openable
						? "cursor-pointer hover:border-border hover:bg-accent/30"
						: "cursor-default opacity-70",
				)}
			>
				<DirectionIcon
					className="size-3.5 shrink-0 text-muted-foreground"
					aria-hidden
				/>
				<Badge variant="secondary" className="shrink-0 text-[10px]">
					{relationLabel(item.relation)}
				</Badge>
				<span className="min-w-0 flex-1 truncate text-sm">{title}</span>
				{item.node ? (
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{entityKindLabel(item.node.kind)}
					</span>
				) : null}
			</button>
		</li>
	);
}

export interface ObjectDetailsPanelProps {
	/** The focused entity to render details for. */
	focus: ObjectGraphNode;
	/** All nodes in the current project graph (for endpoint resolution). */
	nodes: readonly ObjectGraphNode[];
	/** All resolved edges in the current project graph. */
	edges: readonly ObjectGraphEdge[];
	/** Open another object's details (navigates the panel). */
	onOpenObject?: (entityId: string) => void;
	/** Start linking this object to another (opens the Link Picker). */
	onStartLink?: (sourceEntityId: string) => void;
	/** Project scope passed to a freshly-created comment thread (optional). */
	v2ProjectId?: string;
}

/**
 * Object-details panel: renders one entity and its outgoing/incoming linked
 * objects (edges), plus an affordance to create a new link. Presentational and
 * data-driven so it unit-tests with static rendering; the live data + link
 * mutation are wired by {@link ProjectObjectGraphLaunchpad}.
 */
export function ObjectDetailsPanel({
	focus,
	nodes,
	edges,
	onOpenObject,
	onStartLink,
	v2ProjectId,
}: ObjectDetailsPanelProps) {
	const { outgoing, incoming } = splitLinkedObjects(
		focus.entityId,
		nodes,
		edges,
	);
	const linkCount = outgoing.length + incoming.length;

	return (
		<section className="space-y-3" aria-label="Детали объекта">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<div className="flex items-center gap-2">
						<LuShare2 className="size-4 text-muted-foreground" aria-hidden />
						<h3 className="truncate text-sm font-semibold">{focus.title}</h3>
					</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Badge variant="outline" className="text-[10px]">
							{entityKindLabel(focus.kind)}
						</Badge>
						<span>
							{linkCount === 0
								? "Нет связанных объектов"
								: `Связанных объектов: ${linkCount}`}
						</span>
					</div>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => onStartLink?.(focus.entityId)}
					disabled={!onStartLink}
				>
					<LuLink className="size-3.5" aria-hidden />
					Связать
				</Button>
			</div>

			<Separator />

			<div className="space-y-1.5">
				<p className="text-xs font-medium text-muted-foreground">
					Исходящие связи
				</p>
				{outgoing.length === 0 ? (
					<p className="text-xs text-muted-foreground/70">
						Нет исходящих связей
					</p>
				) : (
					<ul className="space-y-1.5">
						{outgoing.map((item) => (
							<LinkedObjectRow
								key={item.edgeId}
								direction="outgoing"
								item={item}
								onOpen={onOpenObject}
							/>
						))}
					</ul>
				)}
			</div>

			<div className="space-y-1.5">
				<p className="text-xs font-medium text-muted-foreground">
					Входящие связи
				</p>
				{incoming.length === 0 ? (
					<p className="text-xs text-muted-foreground/70">
						Нет входящих связей
					</p>
				) : (
					<ul className="space-y-1.5">
						{incoming.map((item) => (
							<LinkedObjectRow
								key={item.edgeId}
								direction="incoming"
								item={item}
								onOpen={onOpenObject}
							/>
						))}
					</ul>
				)}
			</div>

			{/*
			 * Durable comment thread on this object (#11). Behind the
			 * `collaboration.threadsAsObjects` gate; `key={focus.entityId}` remounts
			 * the thread when the panel navigates to another object.
			 */}
			<ExperimentalFeatureGate featureId="collaboration.threadsAsObjects">
				<Separator />
				<CommentsSection
					key={focus.entityId}
					entityId={focus.entityId}
					v2ProjectId={v2ProjectId}
				/>
			</ExperimentalFeatureGate>
		</section>
	);
}
