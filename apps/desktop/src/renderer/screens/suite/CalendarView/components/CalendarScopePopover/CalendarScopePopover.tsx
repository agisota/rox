import { Button } from "@rox/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { cn } from "@rox/ui/utils";
import { Check, ListFilter } from "lucide-react";
import type { CalendarRow } from "../../types";

interface CalendarScopePopoverProps {
	calendars: CalendarRow[];
	/** Currently selected calendar ids; empty set = all visible. */
	selected: Set<string>;
	onToggle: (calendarId: string) => void;
	onReset: () => void;
}

/**
 * Multi-calendar scope control (NEW). A popover listing every readable calendar
 * with its color dot; toggling rows narrows the `calendarIds` passed to
 * `listOccurrences`. An empty selection means "all calendars" (the server's
 * default when `calendarIds` is omitted), so the trigger shows a count only when
 * a subset is active.
 */
export function CalendarScopePopover({
	calendars,
	selected,
	onToggle,
	onReset,
}: CalendarScopePopoverProps) {
	const activeCount = selected.size;
	const label =
		activeCount === 0 ? "Все календари" : `Календари: ${activeCount}`;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					aria-label="Фильтр календарей"
					title="Фильтр календарей"
				>
					<ListFilter className="size-4" />
					<span className="hidden sm:inline">{label}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-1">
				<div className="px-2 py-1.5">
					<p className="font-medium text-muted-foreground text-xs">
						Показывать события из
					</p>
				</div>
				<ul className="max-h-72 space-y-0.5 overflow-y-auto">
					{calendars.map((cal) => {
						// With an active subset, dim the calendars that are filtered out.
						const isOn = activeCount === 0 || selected.has(cal.id);
						const color = cal.color ?? undefined;
						return (
							<li key={cal.id}>
								<button
									type="button"
									onClick={() => onToggle(cal.id)}
									className={cn(
										"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60",
										!isOn && "opacity-50",
									)}
								>
									<span
										aria-hidden
										className={cn(
											"size-2.5 shrink-0 rounded-full",
											!color && "bg-primary",
										)}
										style={color ? { backgroundColor: color } : undefined}
									/>
									<span className="min-w-0 flex-1 truncate">{cal.name}</span>
									{selected.has(cal.id) && (
										<Check className="size-3.5 shrink-0 text-primary" />
									)}
								</button>
							</li>
						);
					})}
				</ul>
				{activeCount > 0 && (
					<div className="border-t p-1">
						<Button
							variant="ghost"
							size="sm"
							className="w-full justify-center text-xs"
							onClick={onReset}
						>
							Показать все
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
