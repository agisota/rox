import {
	buildRrule,
	matchPreset,
	type PresetMatch,
	type Weekday,
} from "@rox/shared/rrule";
import { Input } from "@rox/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import cronstrue from "cronstrue/i18n";
import { useMemo, useState } from "react";
import { LuClock } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cronToRrule } from "../../lib/cronToRrule";
import { describeScheduleRu } from "../../lib/scheduleRu";

type PresetKind = PresetMatch["kind"];

interface SchedulePickerState {
	kind: PresetKind;
	hour: number;
	minute: number;
	day: Weekday;
	customRrule: string;
}

interface SchedulePickerProps {
	rrule: string;
	onRruleChange: (rrule: string) => void;
	/** IANA timezone used to preview the cron tab's next-run instants. */
	timezone?: string;
	className?: string;
}

const PRESET_OPTIONS: { value: PresetKind; label: string }[] = [
	{ value: "hourly", label: "Каждый час" },
	{ value: "daily", label: "Ежедневно" },
	{ value: "weekdays", label: "По будням" },
	{ value: "weekly", label: "Еженедельно" },
	{ value: "custom", label: "Свой вариант" },
];

const DAY_OPTIONS: { value: Weekday; label: string }[] = [
	{ value: "MO", label: "Понедельник" },
	{ value: "TU", label: "Вторник" },
	{ value: "WE", label: "Среда" },
	{ value: "TH", label: "Четверг" },
	{ value: "FR", label: "Пятница" },
	{ value: "SA", label: "Суббота" },
	{ value: "SU", label: "Воскресенье" },
];

/** Derive the picker's structured state from an RRULE string. */
function stateFromRrule(rrule: string): SchedulePickerState {
	const match = matchPreset(rrule);
	const base: SchedulePickerState = {
		kind: match.kind,
		hour: 9,
		minute: 0,
		day: "MO",
		customRrule: "",
	};
	switch (match.kind) {
		case "daily":
		case "weekdays":
			return { ...base, hour: match.hour, minute: match.minute };
		case "weekly":
			return {
				...base,
				hour: match.hour,
				minute: match.minute,
				day: match.day,
			};
		case "custom":
			return { ...base, customRrule: match.rrule };
		default:
			return base;
	}
}

/** Serialize the picker state back into an RRULE string. */
function rruleFromState(state: SchedulePickerState): string {
	switch (state.kind) {
		case "hourly":
			return buildRrule({ kind: "hourly" });
		case "daily":
			return buildRrule({
				kind: "daily",
				hour: state.hour,
				minute: state.minute,
			});
		case "weekdays":
			return buildRrule({
				kind: "weekdays",
				hour: state.hour,
				minute: state.minute,
			});
		case "weekly":
			return buildRrule({
				kind: "weekly",
				day: state.day,
				hour: state.hour,
				minute: state.minute,
			});
		case "custom":
			return state.customRrule.trim();
	}
}

function formatTimeInputValue(hour: number, minute: number): string {
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeInputValue(
	value: string,
): { hour: number; minute: number } | null {
	const [h, m] = value.split(":");
	const hour = Number.parseInt(h ?? "", 10);
	const minute = Number.parseInt(m ?? "", 10);
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
	return { hour, minute };
}

function cronPreviewRu(expr: string): string | null {
	const trimmed = expr.trim();
	if (!trimmed) return null;
	try {
		return cronstrue.toString(trimmed, {
			locale: "ru",
			use24HourTimeFormat: true,
			throwExceptionOnParseError: true,
		});
	} catch {
		return null;
	}
}

const DEFAULT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function SchedulePicker({
	rrule,
	onRruleChange,
	timezone,
	className,
}: SchedulePickerProps) {
	const [state, setState] = useState<SchedulePickerState>(() =>
		stateFromRrule(rrule),
	);
	const [cronExpr, setCronExpr] = useState("0 9 * * 1-5");

	const update = (patch: Partial<SchedulePickerState>) => {
		const next = { ...state, ...patch };
		setState(next);
		onRruleChange(rruleFromState(next));
	};

	const triggerLabel = useMemo(() => describeScheduleRu(rrule), [rrule]);

	const cronPreview = useMemo(() => cronPreviewRu(cronExpr), [cronExpr]);
	const cronAsRrule = useMemo(() => cronToRrule(cronExpr), [cronExpr]);

	// Preview next 5 occurrences only when the cron maps cleanly onto an RRULE
	// the backend understands. Reuses the existing validateRrule endpoint.
	const { data: cronValidation } = useQuery({
		queryKey: ["automation-cron-preview", cronAsRrule, timezone ?? DEFAULT_TZ],
		queryFn: () =>
			apiTrpcClient.automation.validateRrule.mutate({
				rrule: cronAsRrule as string,
				timezone: timezone ?? DEFAULT_TZ,
			}),
		enabled: !!cronAsRrule,
	});

	const applyCron = () => {
		if (cronAsRrule) onRruleChange(cronAsRrule);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={className}
					icon={<LuClock className="size-4 shrink-0" />}
					label={triggerLabel}
				/>
			</PopoverTrigger>
			<PopoverContent className="w-80" align="start" side="top" sideOffset={8}>
				<Tabs defaultValue="time" className="gap-3">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="time">Время</TabsTrigger>
						<TabsTrigger value="cron">Cron</TabsTrigger>
					</TabsList>

					<TabsContent value="time" className="flex flex-col gap-3">
						<Select
							value={state.kind}
							onValueChange={(value) => update({ kind: value as PresetKind })}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PRESET_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{state.kind === "weekly" && (
							<Select
								value={state.day}
								onValueChange={(value) => update({ day: value as Weekday })}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DAY_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

						{(state.kind === "daily" ||
							state.kind === "weekdays" ||
							state.kind === "weekly") && (
							<Input
								type="time"
								// color-scheme tells Chromium to render native controls (the
								// clock icon) in a theme-appropriate color — without it the icon
								// stays a dim gray regardless of background.
								className="dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
								value={formatTimeInputValue(state.hour, state.minute)}
								onChange={(event) => {
									const parsed = parseTimeInputValue(event.target.value);
									if (parsed) update(parsed);
								}}
							/>
						)}

						{state.kind === "custom" && (
							<Input
								autoFocus
								placeholder="FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0"
								className="font-mono text-xs"
								value={state.customRrule}
								onChange={(event) =>
									update({ customRrule: event.target.value })
								}
							/>
						)}
					</TabsContent>

					<TabsContent value="cron" className="flex flex-col gap-2">
						<Input
							placeholder="0 9 * * 1-5"
							className="font-mono text-xs"
							value={cronExpr}
							onChange={(event) => setCronExpr(event.target.value)}
						/>

						<div className="min-h-[1.25rem] text-xs">
							{cronPreview ? (
								<span className="text-foreground">{cronPreview}</span>
							) : (
								<span className="text-destructive">
									Не удалось распознать cron-выражение
								</span>
							)}
						</div>

						{cronPreview && !cronAsRrule && (
							<p className="text-[11px] leading-snug text-muted-foreground">
								Это расписание нельзя сохранить как RRULE. Используйте вкладку
								«Время» или поле RRULE для более сложных правил.
							</p>
						)}

						{cronAsRrule && cronValidation?.nextRuns?.length ? (
							<div className="flex flex-col gap-1 rounded-md border border-border/60 bg-card/40 p-2">
								<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
									Следующие 5 запусков
								</span>
								<ul className="flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground">
									{cronValidation.nextRuns.slice(0, 5).map((iso) => (
										<li key={String(iso)}>
											{new Intl.DateTimeFormat("ru", {
												timeZone: timezone ?? DEFAULT_TZ,
												day: "numeric",
												month: "short",
												hour: "2-digit",
												minute: "2-digit",
											}).format(new Date(iso))}
										</li>
									))}
								</ul>
							</div>
						) : null}

						<button
							type="button"
							disabled={!cronAsRrule}
							onClick={applyCron}
							className="mt-0.5 inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Применить расписание
						</button>
					</TabsContent>
				</Tabs>
			</PopoverContent>
		</Popover>
	);
}
