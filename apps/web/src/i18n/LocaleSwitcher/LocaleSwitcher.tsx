"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Check, Languages } from "lucide-react";

import { LOCALE_LABELS, LOCALES } from "../constants";
import { useTranslation } from "../useTranslation";

/** Compact language picker that persists the choice via {@link useTranslation}. */
export function LocaleSwitcher() {
	const { locale, setLocale } = useTranslation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-secondary/50 px-3 py-1.5 text-sm font-medium transition-all duration-150 hover:border-border hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Language"
				>
					<Languages className="size-4 text-muted-foreground" />
					<span>{LOCALE_LABELS[locale]}</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-40">
				{LOCALES.map((value) => (
					<DropdownMenuItem
						key={value}
						className="cursor-pointer gap-2"
						onSelect={() => setLocale(value)}
					>
						<span className="flex-1">{LOCALE_LABELS[value]}</span>
						{value === locale && <Check className="size-4 text-primary" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
