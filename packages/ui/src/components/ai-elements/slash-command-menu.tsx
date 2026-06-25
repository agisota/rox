"use client";

/**
 * Shared slash-command menu UI (F45) — web + desktop.
 *
 * A `/`-triggered command menu driven by the platform-neutral matcher in
 * `@rox/shared/command-palette` (`filterSlashMenu`, `getSlashMenuQuery`). It is
 * deliberately not bound to Tiptap or any specific editor: the host feeds it the
 * current composer value and forwards keyboard events to the returned handler,
 * so the same component serves the web composer today and can replace the
 * desktop Tiptap menu later. Mobile uses the identical matcher with its own RN
 * renderer.
 *
 * Each entry is badged by its source (built-in · sub-arg `/model` `/theme` ·
 * agent · plugin · skill) and rendered locale-aware. Open/scroll animation is
 * gated by `useShouldAnimate` so reduced-motion users get the final state
 * instantly.
 */

import {
	filterSlashMenu,
	getSlashMenuQuery,
	resolveLocalizedText,
	type SlashMenuEntry,
	type SlashMenuEntrySource,
} from "@rox/shared/command-palette";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "../../lib/utils";
import { useShouldAnimate } from "../../motion";

/** Locale-aware labels for the source badge. */
const SOURCE_BADGE_LABELS: Record<
	SlashMenuEntrySource,
	{ en: string; ru: string }
> = {
	builtin: { en: "builtin", ru: "встроенная" },
	"sub-arg": { en: "option", ru: "параметр" },
	agent: { en: "agent", ru: "агент" },
	plugin: { en: "plugin", ru: "плагин" },
	skill: { en: "skill", ru: "навык" },
	command: { en: "command", ru: "команда" },
};

function badgeLabel(source: SlashMenuEntrySource, locale: string): string {
	const label = SOURCE_BADGE_LABELS[source];
	const short = locale.split("-")[0];
	return short === "ru" ? label.ru : label.en;
}

export interface UseSlashCommandMenuOptions {
	/** Current composer value (the raw text the user is typing). */
	value: string;
	/** All available slash entries (built-ins merged with host commands). */
	entries: SlashMenuEntry[];
}

export interface SlashCommandMenuState {
	/** Whether the menu should be shown. */
	isOpen: boolean;
	/** Ranked, filtered entries for the active query. */
	matches: SlashMenuEntry[];
	/** Index of the highlighted entry. */
	selectedIndex: number;
	/** Move the highlight (mouse hover). */
	setSelectedIndex: (index: number) => void;
	/**
	 * Forward a composer keydown here. Returns `true` when the menu consumed the
	 * event (caller should not also act on it). `onSelect` fires for Enter/Tab.
	 */
	handleKeyDown: (
		event: ReactKeyboardEvent,
		onSelect: (entry: SlashMenuEntry) => void,
	) => boolean;
	/** Close the menu (e.g. after a selection or blur). */
	close: () => void;
}

/**
 * Headless state for the slash menu: detects the active `/` query from the
 * composer value, ranks entries via the shared matcher, and provides keyboard
 * navigation. Pairs with {@link SlashCommandMenu} for rendering.
 */
export function useSlashCommandMenu({
	value,
	entries,
}: UseSlashCommandMenuOptions): SlashCommandMenuState {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [dismissed, setDismissed] = useState(false);

	const query = getSlashMenuQuery(value);

	// Re-open when the user edits the slash token after a manual dismiss.
	const lastQueryRef = useRef<string | null>(query);
	useEffect(() => {
		if (query !== lastQueryRef.current) {
			lastQueryRef.current = query;
			setDismissed(false);
		}
	}, [query]);

	const matches = useMemo(
		() =>
			query === null ? [] : filterSlashMenu(entries, query).map((m) => m.entry),
		[entries, query],
	);

	const isOpen = query !== null && !dismissed && matches.length > 0;

	// Clamp the highlight whenever the result set shrinks.
	useEffect(() => {
		setSelectedIndex((index) =>
			matches.length === 0 ? 0 : Math.min(index, matches.length - 1),
		);
	}, [matches.length]);

	const close = useCallback(() => setDismissed(true), []);

	const handleKeyDown = useCallback(
		(
			event: ReactKeyboardEvent,
			onSelect: (entry: SlashMenuEntry) => void,
		): boolean => {
			if (!isOpen) return false;
			switch (event.key) {
				case "ArrowDown":
					event.preventDefault();
					setSelectedIndex((index) => (index + 1) % matches.length);
					return true;
				case "ArrowUp":
					event.preventDefault();
					setSelectedIndex(
						(index) => (index - 1 + matches.length) % matches.length,
					);
					return true;
				case "Enter":
				case "Tab": {
					const entry = matches[selectedIndex];
					if (!entry) return false;
					event.preventDefault();
					onSelect(entry);
					return true;
				}
				case "Escape":
					event.preventDefault();
					close();
					return true;
				default:
					return false;
			}
		},
		[close, isOpen, matches, selectedIndex],
	);

	return {
		isOpen,
		matches,
		selectedIndex,
		setSelectedIndex,
		handleKeyDown,
		close,
	};
}

export interface SlashCommandMenuProps {
	/** Ranked entries to render. */
	matches: SlashMenuEntry[];
	/** Highlighted index. */
	selectedIndex: number;
	/** Select an entry (click). */
	onSelect: (entry: SlashMenuEntry) => void;
	/** Highlight an entry (hover). */
	onHover: (index: number) => void;
	/** BCP-47 locale used for labels and badges. Defaults to "en". */
	locale?: string;
	className?: string;
}

/**
 * Presentational slash-command menu. Anchor it above the composer; it does not
 * own positioning so hosts can place it inside a Popover/relative container as
 * they prefer.
 */
export function SlashCommandMenu({
	matches,
	selectedIndex,
	onSelect,
	onHover,
	locale = "en",
	className,
}: SlashCommandMenuProps) {
	const selectedRef = useRef<HTMLButtonElement>(null);
	const shouldAnimate = useShouldAnimate();

	// biome-ignore lint/correctness/useExhaustiveDependencies: must scroll when selectedIndex changes
	useEffect(() => {
		selectedRef.current?.scrollIntoView({
			block: "nearest",
			behavior: shouldAnimate ? "smooth" : "auto",
		});
	}, [selectedIndex, shouldAnimate]);

	if (matches.length === 0) return null;

	return (
		<div
			role="listbox"
			aria-label="Slash commands"
			className={cn(
				"bg-popover text-popover-foreground border-border max-h-[200px] w-full overflow-y-auto rounded-md border p-1 text-xs shadow-md",
				className,
			)}
		>
			{matches.map((entry, index) => {
				const isSelected = index === selectedIndex;
				const description = resolveLocalizedText(entry.description, locale);
				return (
					<button
						key={entry.name}
						ref={isSelected ? selectedRef : undefined}
						type="button"
						role="option"
						aria-selected={isSelected}
						className={cn(
							"flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
							isSelected
								? "bg-accent text-accent-foreground"
								: "hover:bg-accent/50",
						)}
						onMouseEnter={() => onHover(index)}
						onMouseDown={(event) => {
							event.preventDefault();
							onSelect(entry);
						}}
					>
						<div className="flex items-center gap-1.5">
							<span className="font-medium">
								<span className="text-muted-foreground font-mono">/</span>
								{entry.name}
							</span>
							<span className="border-border/70 bg-muted/40 text-muted-foreground rounded-sm border px-1 py-0.5 font-mono text-[10px] uppercase leading-none">
								{badgeLabel(entry.source, locale)}
							</span>
							{entry.argumentHint && (
								<span className="text-muted-foreground">
									{entry.argumentHint}
								</span>
							)}
						</div>
						{description && (
							<span className="text-muted-foreground pl-4">{description}</span>
						)}
						{entry.aliases.length > 0 && (
							<span className="text-muted-foreground pl-4 font-mono">
								{entry.aliases.map((alias) => `/${alias}`).join(", ")}
							</span>
						)}
						{entry.allowedTools && entry.allowedTools.length > 0 && (
							<span className="text-muted-foreground/70 pl-4 font-mono text-[10px]">
								tools: {entry.allowedTools.join(", ")}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
