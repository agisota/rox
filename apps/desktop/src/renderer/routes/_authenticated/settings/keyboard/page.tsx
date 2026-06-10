import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Kbd, KbdGroup } from "@rox/ui/kbd";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { cn } from "@rox/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import {
	HOTKEYS,
	type HotkeyCategory,
	type HotkeyId,
	type ShortcutBinding,
	useFormatBinding,
	useHotkeyDisplay,
	useHotkeyOverridesStore,
	useKeyboardPreferencesStore,
	useRecordHotkeys,
} from "renderer/hotkeys";

const CATEGORY_ORDER: HotkeyCategory[] = [
	"Navigation",
	"Workspace",
	"Terminal",
	"Layout",
	"Window",
	"Help",
];

function HotkeyRow({
	id,
	label,
	description,
	isRecording,
	onStartRecording,
	onReset,
}: {
	id: HotkeyId;
	label: string;
	description?: string;
	isRecording: boolean;
	onStartRecording: () => void;
	onReset: () => void;
}) {
	const { keys } = useHotkeyDisplay(id);

	return (
		<div
			className={cn(
				"flex items-center justify-between gap-4 py-3 px-4 transition-colors",
				isRecording && "bg-destructive/5",
			)}
		>
			<div className="flex flex-col">
				<span className="text-sm text-foreground">{label}</span>
				{description && (
					<span className="text-xs text-muted-foreground">{description}</span>
				)}
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onStartRecording}
					className={cn(
						"h-7 px-3 rounded-md border text-xs transition-colors",
						isRecording
							? "border-destructive/50 bg-destructive/10 text-destructive ring-2 ring-destructive/20"
							: "border-border bg-accent/20 text-foreground hover:bg-accent/40",
					)}
				>
					{isRecording ? (
						<span>Нажмите клавишу…</span>
					) : (
						<KbdGroup>
							{keys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>
					)}
				</button>
				<Button variant="ghost" size="sm" onClick={onReset}>
					Сбросить
				</Button>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/_authenticated/settings/keyboard/")({
	component: KeyboardShortcutsPage,
});

function getHotkeysByCategory(): Record<
	HotkeyCategory,
	Array<{ id: HotkeyId; label: string; description?: string }>
> {
	const grouped: Record<
		HotkeyCategory,
		Array<{ id: HotkeyId; label: string; description?: string }>
	> = {
		Navigation: [],
		Workspace: [],
		Layout: [],
		Terminal: [],
		Window: [],
		Help: [],
	};
	for (const [id, hotkey] of Object.entries(HOTKEYS)) {
		grouped[hotkey.category as HotkeyCategory].push({
			id: id as HotkeyId,
			label: hotkey.label,
			description: hotkey.description,
		});
	}
	return grouped;
}

const hotkeysByCategory = getHotkeysByCategory();

function KeyboardShortcutsPage() {
	const [searchQuery, setSearchQuery] = useState("");
	const [recordingId, setRecordingId] = useState<HotkeyId | null>(null);
	const [pendingConflict, setPendingConflict] = useState<{
		targetId: HotkeyId;
		binding: ShortcutBinding;
		conflictId: HotkeyId;
	} | null>(null);

	const resetOverride = useHotkeyOverridesStore((s) => s.resetOverride);
	const resetAll = useHotkeyOverridesStore((s) => s.resetAll);
	const setOverride = useHotkeyOverridesStore((s) => s.setOverride);

	const adaptiveLayoutEnabled = useKeyboardPreferencesStore(
		(s) => s.adaptiveLayoutEnabled,
	);
	const setAdaptiveLayoutEnabled = useKeyboardPreferencesStore(
		(s) => s.setAdaptiveLayoutEnabled,
	);

	useRecordHotkeys(recordingId, {
		// New printable bindings follow the printed character (matches what the
		// user sees on their keyboard). F-keys / named keys are forced to
		// "named" by the recorder regardless of this preference.
		preferredMode: "logical",
		onSave: () => setRecordingId(null),
		onCancel: () => setRecordingId(null),
		onUnassign: () => setRecordingId(null),
		onConflict: (targetId, binding, conflictId) => {
			setPendingConflict({ targetId, binding, conflictId });
			setRecordingId(null);
		},
		onReserved: (_binding, info) => {
			if (info.severity === "error") {
				toast.error(info.reason);
				setRecordingId(null);
			} else {
				toast.warning(info.reason);
			}
		},
	});

	const { keys: showHotkeysKeys } = useHotkeyDisplay("SHOW_HOTKEYS");

	const filteredHotkeysByCategory = useMemo(() => {
		if (!searchQuery) return hotkeysByCategory;
		const lower = searchQuery.toLowerCase();
		return Object.fromEntries(
			CATEGORY_ORDER.map((category) => [
				category,
				(hotkeysByCategory[category] ?? []).filter((hotkey) =>
					hotkey.label.toLowerCase().includes(lower),
				),
			]),
		) as typeof hotkeysByCategory;
	}, [searchQuery]);

	const handleStartRecording = (id: HotkeyId) => {
		setRecordingId((current) => (current === id ? null : id));
	};

	const handleConflictReassign = () => {
		if (!pendingConflict) return;
		setOverride(pendingConflict.conflictId, null);
		setOverride(pendingConflict.targetId, pendingConflict.binding);
		setPendingConflict(null);
	};

	const conflictDisplay = useFormatBinding(pendingConflict?.binding ?? null);

	return (
		<div className="p-6 max-w-4xl w-full">
			{/* Header */}
			<div className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Горячие клавиши</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Настройте горячие клавиши под свой процесс. Нажмите{" "}
						<KbdGroup>
							{showHotkeysKeys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>{" "}
						чтобы открыть эту страницу в любое время.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						setRecordingId(null);
						resetAll();
					}}
				>
					Сбросить все
				</Button>
			</div>

			{/* Preferences */}
			<div className="mb-8 flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="adaptive-layout" className="text-sm font-medium">
						Адаптация к раскладке
					</Label>
					<p className="text-xs text-muted-foreground">
						Привязывать сочетания к символам на клавиатуре: например, ⌘Z всегда
						срабатывает на клавише с меткой "Z", даже если физически это KeyY в
						QWERTZ. Если выключено, сочетания привязаны к физическим позициям
						клавиш и игнорируют текущий источник ввода.
					</p>
				</div>
				<Switch
					id="adaptive-layout"
					checked={adaptiveLayoutEnabled}
					onCheckedChange={setAdaptiveLayoutEnabled}
				/>
			</div>

			{/* Search */}
			<div className="relative mb-6">
				<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					type="text"
					placeholder="Поиск"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="pl-9 bg-accent/30 border-transparent focus:border-accent"
				/>
			</div>

			{/* Tables by Category */}
			<div className="space-y-6">
				{CATEGORY_ORDER.map((category) => {
					const hotkeys = filteredHotkeysByCategory[category] ?? [];
					if (hotkeys.length === 0) return null;

					return (
						<div key={category}>
							<h3 className="text-sm font-medium text-muted-foreground mb-2">
								{category}
							</h3>
							<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
								{hotkeys.map((hotkey) => (
									<HotkeyRow
										key={hotkey.id}
										id={hotkey.id}
										label={hotkey.label}
										description={hotkey.description}
										isRecording={recordingId === hotkey.id}
										onStartRecording={() => handleStartRecording(hotkey.id)}
										onReset={() => {
											setRecordingId((current) =>
												current === hotkey.id ? null : current,
											);
											resetOverride(hotkey.id);
										}}
									/>
								))}
							</div>
						</div>
					);
				})}

				{CATEGORY_ORDER.every(
					(cat) => (filteredHotkeysByCategory[cat] ?? []).length === 0,
				) && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Горячие клавиши не найдены по запросу "{searchQuery}"
					</div>
				)}
			</div>

			{/* Conflict dialog */}
			<AlertDialog
				open={!!pendingConflict}
				onOpenChange={() => setPendingConflict(null)}
			>
				<AlertDialogContent className="max-w-[380px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Сочетание уже используется
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									{pendingConflict
										? `${conflictDisplay.text} is already assigned to "${
												HOTKEYS[pendingConflict.conflictId].label
											}".`
										: ""}
								</span>
								<span className="block">Переназначить его?</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setPendingConflict(null)}
						>
							Отмена
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={handleConflictReassign}
						>
							Переназначить
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
