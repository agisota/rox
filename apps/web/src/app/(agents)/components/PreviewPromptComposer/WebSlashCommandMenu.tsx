"use client";

/**
 * Web slash-command menu host (F45).
 *
 * Mounts the shared `@rox/ui` slash menu over the web composer's
 * `PromptInputTextarea`. It reads the live composer value and rewrites it
 * through the prompt-input controller, and bridges keyboard navigation by
 * intercepting the textarea's keydown in the capture phase (so ArrowUp/Down/
 * Enter drive the menu before the textarea acts on them). Selecting an entry
 * inserts `/name ` for commands that take arguments, or `/name` ready to send
 * otherwise — mirroring the desktop `resolveCommandAction` behavior.
 */

import {
	getBuiltinSlashMenuEntries,
	getSlashMenuQuery,
	type SlashMenuEntry,
} from "@rox/shared/command-palette";
import { usePromptInputController } from "@rox/ui/ai-elements/prompt-input";
import {
	SlashCommandMenu,
	useSlashCommandMenu,
} from "@rox/ui/ai-elements/slash-command-menu";
import { useCallback, useEffect, useMemo, useRef } from "react";

/** Build the next composer value for a chosen entry. */
function applyEntry(entry: SlashMenuEntry): string {
	// Commands with arguments keep the menu's slot open for typing; argument-less
	// commands are inserted ready to send.
	return entry.argumentHint.trim() ? `/${entry.name} ` : `/${entry.name}`;
}

export interface WebSlashCommandMenuProps {
	/**
	 * Slash entries to offer. Defaults to the shared built-ins, which are the
	 * commands every host can list without the desktop chat service.
	 */
	entries?: SlashMenuEntry[];
	/** BCP-47 locale for labels/badges. */
	locale?: string;
}

export function WebSlashCommandMenu({
	entries = getBuiltinSlashMenuEntries(),
	locale = "ru",
}: WebSlashCommandMenuProps) {
	const controller = usePromptInputController();
	const value = controller.textInput.value;
	const containerRef = useRef<HTMLDivElement>(null);

	const menu = useSlashCommandMenu({ value, entries });

	const select = useCallback(
		(entry: SlashMenuEntry) => {
			controller.textInput.setInput(applyEntry(entry));
			controller.textInput.focus();
			menu.close();
		},
		[controller, menu.close],
	);

	// Bridge keyboard navigation from the textarea into the menu. Capture phase so
	// the menu consumes ArrowUp/Down/Enter before the textarea's own handler. The
	// latest menu state and select handler are read through refs, so the listener
	// is attached once and never goes stale.
	const menuRef = useRef(menu);
	menuRef.current = menu;
	const selectRef = useRef(select);
	selectRef.current = select;
	useEffect(() => {
		const container = containerRef.current;
		const textarea = container
			?.closest("form")
			?.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		const onKeyDown = (event: KeyboardEvent) => {
			const current = menuRef.current;
			if (!current.isOpen) return;
			const handled = current.handleKeyDown(
				// The shared hook only reads `key`/`preventDefault`, both present on
				// the native event; the React typing is structurally compatible.
				event as unknown as React.KeyboardEvent,
				selectRef.current,
			);
			if (handled) event.stopPropagation();
		};

		textarea.addEventListener("keydown", onKeyDown, { capture: true });
		return () =>
			textarea.removeEventListener("keydown", onKeyDown, { capture: true });
	}, []);

	const isOpen = useMemo(
		() => menu.isOpen && getSlashMenuQuery(value) !== null,
		[menu.isOpen, value],
	);

	return (
		<div ref={containerRef} className="relative">
			{isOpen && (
				<div className="absolute bottom-full left-0 z-50 mb-1 w-full">
					<SlashCommandMenu
						matches={menu.matches}
						selectedIndex={menu.selectedIndex}
						onSelect={select}
						onHover={menu.setSelectedIndex}
						locale={locale}
					/>
				</div>
			)}
		</div>
	);
}
