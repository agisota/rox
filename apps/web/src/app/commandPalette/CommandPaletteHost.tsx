"use client";

import {
	executeCommand,
	matchCommands,
	type Command as PaletteCommand,
	resolveActiveCommands,
} from "@rox/shared/command-palette";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import { toast } from "@rox/ui/sonner";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	WEB_SECTION_LABELS,
	WEB_SECTION_ORDER,
	type WebCommandContext,
} from "./context";
import { webCommandProviders } from "./providers";

/**
 * Web ⌘K command palette host (F44). Built on the `cmdk` `CommandDialog`
 * primitive from `@rox/ui`, driven by the platform-neutral palette core in
 * `@rox/shared/command-palette` (shared registry resolution, scope-prefix
 * matcher and execute pipeline — identical semantics to desktop/mobile).
 *
 * cmdk's built-in filter is disabled (`shouldFilter={false}`); the shared
 * matcher does scope-prefix parsing (`>` commands · `#` tags · `@` profiles ·
 * `/` files) and fuzzy ranking instead.
 */
export function WebCommandPaletteHost() {
	const router = useRouter();
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const context = useMemo<WebCommandContext>(
		() => ({
			pathname,
			navigate: (href) => router.push(href),
		}),
		[pathname, router],
	);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((prev) => !prev);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	const sections = useMemo(
		() =>
			resolveActiveCommands(webCommandProviders, context, {
				order: WEB_SECTION_ORDER,
				labels: WEB_SECTION_LABELS,
			}),
		[context],
	);

	const onSelect = useCallback(
		async (command: PaletteCommand<WebCommandContext>) => {
			setOpen(false);
			await executeCommand(command, context, {
				notifyInfo: (message) => toast.info(message),
				notifyError: (message) => toast.error(message),
			});
		},
		[context],
	);

	const matchedSections = useMemo(
		() =>
			sections
				.map((section) => ({
					...section,
					results: matchCommands(section.commands, query),
				}))
				.filter((section) => section.results.length > 0),
		[sections, query],
	);

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
			commandProps={{ shouldFilter: false }}
			title="Командная палитра"
			description="Найдите команду для выполнения"
		>
			<CommandInput
				value={query}
				onValueChange={setQuery}
				placeholder="Поиск команд… (> команды · # теги · @ профили · / файлы)"
			/>
			<CommandList>
				<CommandEmpty>Ничего не найдено.</CommandEmpty>
				{matchedSections.map((section) => (
					<CommandGroup key={section.id} heading={section.label}>
						{section.results.map(({ command }) => (
							<CommandItem
								key={command.id}
								value={command.id}
								disabled={command.disabled}
								onSelect={() => void onSelect(command)}
							>
								{command.title}
							</CommandItem>
						))}
					</CommandGroup>
				))}
			</CommandList>
		</CommandDialog>
	);
}
