import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { SelectMemoryItem } from "@rox/db/schema";
import { CommandPrimitive } from "@rox/ui/command";
import { cn } from "@rox/ui/utils";
import { useEffect, useState } from "react";
import {
	HiOutlineArrowDownTray,
	HiOutlineMagnifyingGlass,
	HiOutlinePlus,
} from "react-icons/hi2";
import { CATEGORY_LABEL } from "renderer/screens/memory/MemoryView/groups";

export interface MemoryCommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Raw query string -> ranked matches (same Orama ranking as inline search). */
	onSearch: (query: string) => Promise<SelectMemoryItem[]>;
	/** Jump to a memory row in the list and pulse it. */
	onJump: (id: string) => void;
	/** Quick action: focus the inline add for the first category. */
	onAddNew: () => void;
	/** Quick action: open the import panel. */
	onOpenImport: () => void;
}

const PALETTE_LIMIT = 8;

/**
 * ⌘K / Ctrl+K retrieval palette. Same Orama ranking as the inline search; Enter
 * on a memory scrolls to and pulses its row, or runs a quick action. cmdk's own
 * filtering is disabled (shouldFilter={false}) so the typo-tolerant BM25 order
 * from Orama is preserved verbatim.
 */
export function MemoryCommandPalette({
	open,
	onOpenChange,
	onSearch,
	onJump,
	onAddNew,
	onOpenImport,
}: MemoryCommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SelectMemoryItem[]>([]);

	// Reset the query each time the palette opens.
	useEffect(() => {
		if (open) {
			setQuery("");
			setResults([]);
		}
	}, [open]);

	// Re-rank on every keystroke against the resident Orama index.
	useEffect(() => {
		let cancelled = false;
		const trimmed = query.trim();
		if (!trimmed) {
			setResults([]);
			return;
		}
		void onSearch(trimmed).then((items) => {
			if (!cancelled) setResults(items.slice(0, PALETTE_LIMIT));
		});
		return () => {
			cancelled = true;
		};
	}, [query, onSearch]);

	const close = () => onOpenChange(false);

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
				<DialogPrimitive.Content
					className={cn(
						"-translate-x-1/2 fixed top-[18%] left-1/2 z-50 w-full max-w-lg",
						"overflow-hidden rounded-xl border border-border bg-popover shadow-2xl",
					)}
				>
					<DialogPrimitive.Title className="sr-only">
						Поиск по памяти
					</DialogPrimitive.Title>
					<DialogPrimitive.Description className="sr-only">
						Найдите запись в памяти и перейдите к ней, либо запустите действие.
					</DialogPrimitive.Description>

					<CommandPrimitive shouldFilter={false} loop>
						<div className="flex h-12 items-center gap-2 border-border border-b px-3">
							<HiOutlineMagnifyingGlass className="size-4 shrink-0 text-muted-foreground" />
							<CommandPrimitive.Input
								autoFocus
								value={query}
								onValueChange={setQuery}
								placeholder="Найти запись в памяти…"
								className="flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
							/>
						</div>

						<CommandPrimitive.List className="max-h-[340px] overflow-y-auto scroll-py-1 p-1">
							{query.trim() !== "" && (
								<CommandPrimitive.Empty className="py-6 text-center text-muted-foreground text-sm">
									Ничего не найдено
								</CommandPrimitive.Empty>
							)}

							{results.length > 0 && (
								<CommandPrimitive.Group
									heading="Записи"
									className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
								>
									{results.map((item) => (
										<CommandPrimitive.Item
											key={item.id}
											value={item.id}
											onSelect={() => {
												onJump(item.id);
												close();
											}}
											className="flex cursor-default items-start gap-2 rounded-md px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
										>
											<span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
												{CATEGORY_LABEL[item.category]}
											</span>
											<span className="line-clamp-2 flex-1 leading-snug">
												{item.body}
											</span>
										</CommandPrimitive.Item>
									))}
								</CommandPrimitive.Group>
							)}

							<CommandPrimitive.Group
								heading="Действия"
								className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
							>
								<CommandPrimitive.Item
									value="__action_add"
									onSelect={() => {
										onAddNew();
										close();
									}}
									className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
								>
									<HiOutlinePlus className="size-4 text-muted-foreground" />
									Добавить запись
								</CommandPrimitive.Item>
								<CommandPrimitive.Item
									value="__action_import"
									onSelect={() => {
										onOpenImport();
										close();
									}}
									className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
								>
									<HiOutlineArrowDownTray className="size-4 text-muted-foreground" />
									Импорт памяти
								</CommandPrimitive.Item>
							</CommandPrimitive.Group>
						</CommandPrimitive.List>
					</CommandPrimitive>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
