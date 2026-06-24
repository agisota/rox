"use client";

import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import { cn } from "../../lib/utils";

/**
 * A broadcast "open intent" stamped with a monotonically increasing epoch.
 *
 * Cards follow the broadcast only when its epoch advances (i.e. when the
 * toolbar fires expand-all / collapse-all). Between broadcasts each card keeps
 * whatever the user toggled it to, so the global control and per-card toggles
 * coexist instead of fighting.
 */
type ToolGroupBroadcast = {
	/** Desired open state for every member card. */
	open: boolean;
	/** Bumped on every expand-all / collapse-all so members can detect changes. */
	epoch: number;
};

type ToolGroupContextValue = {
	broadcast: ToolGroupBroadcast;
	expandAll: () => void;
	collapseAll: () => void;
	setItemOpen: (id: string, open: boolean | undefined) => void;
	itemCount: number;
	openCount: number;
};

/**
 * Exported so tests (and advanced consumers) can supply a precise group value
 * directly. Prefer {@link ToolGroup} for normal use.
 */
export const ToolGroupContext = createContext<ToolGroupContextValue | null>(
	null,
);
export type { ToolGroupContextValue };

/** Read the surrounding ToolGroup, or `null` when a card renders standalone. */
export const useToolGroup = (): ToolGroupContextValue | null =>
	useContext(ToolGroupContext);

export type ToolGroupProps = ComponentProps<"div"> & {
	/** Initial open state for member cards before any expand-all/collapse-all. */
	defaultOpen?: boolean;
};

/**
 * Groups collapsible tool/reasoning cards so a single control can expand or
 * collapse them all at once, while each card keeps its own toggle.
 *
 * Wrap the assistant turn's cards in this provider and drop a
 * {@link ToolGroupExpandAll} control beside them. Cards opt in via
 * {@link useToolGroupItem} (the `Tool` and `Reasoning` primitives already do).
 */
export const ToolGroup = ({
	className,
	defaultOpen = false,
	children,
	...props
}: ToolGroupProps) => {
	const [broadcast, setBroadcast] = useState<ToolGroupBroadcast>({
		open: defaultOpen,
		epoch: 0,
	});
	const [openById, setOpenById] = useState<Record<string, boolean>>({});

	const setItemOpen = useCallback((id: string, open: boolean | undefined) => {
		setOpenById((prev) => {
			if (open === undefined) {
				if (!(id in prev)) return prev;
				const { [id]: _removed, ...rest } = prev;
				return rest;
			}
			if (prev[id] === open) return prev;
			return { ...prev, [id]: open };
		});
	}, []);

	const expandAll = useCallback(() => {
		setBroadcast((prev) => ({ open: true, epoch: prev.epoch + 1 }));
	}, []);

	const collapseAll = useCallback(() => {
		setBroadcast((prev) => ({ open: false, epoch: prev.epoch + 1 }));
	}, []);

	const { itemCount, openCount } = useMemo(() => {
		const values = Object.values(openById);
		return {
			itemCount: values.length,
			openCount: values.filter(Boolean).length,
		};
	}, [openById]);

	const value = useMemo<ToolGroupContextValue>(
		() => ({
			broadcast,
			expandAll,
			collapseAll,
			setItemOpen,
			itemCount,
			openCount,
		}),
		[broadcast, expandAll, collapseAll, setItemOpen, itemCount, openCount],
	);

	return (
		<ToolGroupContext.Provider value={value}>
			<div className={cn("not-prose", className)} {...props}>
				{children}
			</div>
		</ToolGroupContext.Provider>
	);
};

export type UseToolGroupItemOptions = {
	/** Per-card default open state, used when standalone or before a broadcast. */
	defaultOpen?: boolean;
};

export type ToolGroupItemState = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

/**
 * Derives a collapsible card's controlled open state from the surrounding
 * {@link ToolGroup}. Returns `{ open, onOpenChange }` to spread onto a
 * `Collapsible`/`Tool`/`Reasoning`.
 *
 * - No provider → behaves as plain local state seeded from `defaultOpen`.
 * - Inside a group → still seeds from the card's own `defaultOpen` (so native
 *   per-card defaults like Reasoning's streaming auto-open survive). Only an
 *   explicit expand-all / collapse-all broadcast overrides it; a manual toggle
 *   in between sticks until the next broadcast.
 */
export const useToolGroupItem = ({
	defaultOpen = false,
}: UseToolGroupItemOptions = {}): ToolGroupItemState => {
	const group = useToolGroup();
	const id = useId();

	const [open, setOpen] = useState(defaultOpen);
	// Track the last broadcast epoch this card honored as STATE (not a ref) so
	// the "adjust state during render" pattern is correct under a single
	// synchronous render pass (SSR) as well as on the client. Baseline 0 = the
	// group's pre-broadcast epoch: while no expand-all/collapse-all has fired
	// (epoch 0) the card keeps its own default. Any later broadcast (epoch >= 1)
	// is adopted — including by cards that stream in AFTER the click, so
	// "expand all" reads as an ongoing intent rather than a one-shot snapshot.
	const [seenEpoch, setSeenEpoch] = useState(0);

	// Follow the group's expand-all/collapse-all when the epoch advances. Derive
	// the effective open value in THIS render (don't wait for the scheduled
	// re-render to read updated state) so the controlled card never paints a
	// stale open state.
	const groupBroadcast = group?.broadcast;
	let effectiveOpen = open;
	if (groupBroadcast && groupBroadcast.epoch !== seenEpoch) {
		effectiveOpen = groupBroadcast.open;
		setSeenEpoch(groupBroadcast.epoch);
		if (open !== groupBroadcast.open) {
			setOpen(groupBroadcast.open);
		}
	}

	// Report membership + open state so the control can count + label itself.
	// Effect-only (never during render) to keep render pure and SSR-safe.
	const setItemOpen = group?.setItemOpen;
	useEffect(() => {
		if (!setItemOpen) return;
		setItemOpen(id, effectiveOpen);
		return () => setItemOpen(id, undefined);
	}, [setItemOpen, id, effectiveOpen]);

	const onOpenChange = useCallback((next: boolean) => {
		setOpen(next);
	}, []);

	return { open: effectiveOpen, onOpenChange };
};

export type ToolGroupExpandAllProps = ComponentProps<"button"> & {
	expandLabel?: string;
	collapseLabel?: string;
};

/**
 * Compact "Expand all / Collapse all" toggle for a {@link ToolGroup}. Shows
 * "Collapse all" once any member card is open, otherwise "Expand all". Renders
 * nothing when there is no surrounding group or no member cards.
 */
export const ToolGroupExpandAll = ({
	className,
	expandLabel = "Expand all",
	collapseLabel = "Collapse all",
	type = "button",
	...props
}: ToolGroupExpandAllProps) => {
	const group = useToolGroup();
	if (!group || group.itemCount === 0) return null;

	const anyOpen = group.openCount > 0;
	const label = anyOpen ? collapseLabel : expandLabel;
	const Icon = anyOpen ? ChevronsDownUpIcon : ChevronsUpDownIcon;

	return (
		<button
			className={cn(
				"flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground text-xs transition-colors hover:bg-muted/50 hover:text-foreground",
				className,
			)}
			data-tool-group-expand-all
			onClick={anyOpen ? group.collapseAll : group.expandAll}
			type={type}
			{...props}
		>
			<Icon className="size-3.5 shrink-0" />
			<span>{label}</span>
		</button>
	);
};
