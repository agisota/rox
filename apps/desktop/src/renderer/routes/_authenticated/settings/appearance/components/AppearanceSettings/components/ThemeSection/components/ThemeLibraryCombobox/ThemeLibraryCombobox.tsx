import { Button } from "@rox/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ThemePreview } from "renderer/components/ThemePreview";
import { ThemeSwatch } from "renderer/components/ThemeSwatch";
import { getLibraryThemes, type Theme } from "shared/themes";

interface ThemeLibraryComboboxProps {
	/** Currently active theme id (used to show the selected check). */
	activeThemeId: string;
	onSelect: (themeId: string) => void;
}

// Windowing cap: the library has hundreds of entries; rendering the full list
// is unnecessary. When not searching, show the first N; Command filters the
// rest on search. Mirrors the FontFamilyCombobox convention.
const MAX_VISIBLE = 100;

/**
 * Searchable, windowed combobox over the bundled Zed theme library
 * (themes-fonts epic). Built-in & custom themes stay in the Select rows; this
 * handles the large library dataset with a filtered, capped list and a live
 * preview of the hovered/selected theme.
 */
export function ThemeLibraryCombobox({
	activeThemeId,
	onSelect,
}: ThemeLibraryComboboxProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	const libraryThemes = useMemo(() => getLibraryThemes(), []);
	const themesById = useMemo(
		() => new Map(libraryThemes.map((t) => [t.id, t])),
		[libraryThemes],
	);

	const activeLibraryTheme = themesById.get(activeThemeId);
	const previewTheme: Theme | undefined =
		(hoveredId ? themesById.get(hoveredId) : undefined) ??
		activeLibraryTheme ??
		libraryThemes[0];

	const visible = useMemo(
		() => (search.trim() ? libraryThemes : libraryThemes.slice(0, MAX_VISIBLE)),
		[libraryThemes, search],
	);

	function handleSelect(themeId: string) {
		onSelect(themeId);
		setOpen(false);
		setSearch("");
	}

	const triggerLabel = activeLibraryTheme
		? activeLibraryTheme.name
		: "Browse library…";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="w-auto min-w-44 justify-between px-2 font-normal"
				>
					<span className="flex items-center gap-2 min-w-0">
						{activeLibraryTheme ? (
							<ThemeSwatch theme={activeLibraryTheme} />
						) : null}
						<span className="truncate text-xs">{triggerLabel}</span>
					</span>
					<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[360px] p-0" align="end" side="bottom">
				<Command shouldFilter={true}>
					<CommandInput
						placeholder={`Search ${libraryThemes.length} library themes…`}
						value={search}
						onValueChange={setSearch}
					/>
					{previewTheme ? (
						<div className="border-b p-3">
							<ThemePreview theme={previewTheme} />
						</div>
					) : null}
					<CommandList>
						<CommandEmpty>No themes found.</CommandEmpty>
						<CommandGroup heading="Library">
							{visible.map((theme) => (
								<CommandItem
									key={theme.id}
									value={`${theme.name} ${theme.id}`}
									onSelect={() => handleSelect(theme.id)}
									onMouseEnter={() => setHoveredId(theme.id)}
									onFocus={() => setHoveredId(theme.id)}
								>
									<ThemeSwatch theme={theme} />
									<span className="truncate flex-1">{theme.name}</span>
									{theme.id === activeThemeId && (
										<CheckIcon className="size-4 shrink-0 opacity-70" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
