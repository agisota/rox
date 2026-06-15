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
import { AnimatePresence, motion } from "framer-motion";
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
import {
	ease,
	KeyCapGroup,
	motionDuration,
	useShouldAnimate,
} from "renderer/motion";
import { staggerContainer, staggerItem } from "renderer/motion/variants";

const CATEGORY_ORDER: HotkeyCategory[] = [
	"Navigation",
	"Workspace",
	"Terminal",
	"Layout",
	"Window",
	"Help",
];

const CATEGORY_LABELS: Record<HotkeyCategory, string> = {
	Navigation: "Навигация",
	Workspace: "Рабочие пространства",
	Terminal: "Терминал",
	Layout: "Раскладка окон",
	Window: "Окно",
	Help: "Справка",
};

const HOTKEY_TEXT: Partial<
	Record<HotkeyId, { label: string; description?: string }>
> = {
	NAVIGATE_BACK: {
		label: "Назад",
		description: "Вернуться на предыдущую страницу в истории",
	},
	NAVIGATE_FORWARD: {
		label: "Вперед",
		description: "Перейти на следующую страницу в истории",
	},
	QUICK_OPEN: {
		label: "Быстро открыть файл",
		description: "Найти и открыть файлы в текущем рабочем пространстве",
	},
	JUMP_TO_WORKSPACE_1: { label: "Переключиться на рабочее пространство 1" },
	JUMP_TO_WORKSPACE_2: { label: "Переключиться на рабочее пространство 2" },
	JUMP_TO_WORKSPACE_3: { label: "Переключиться на рабочее пространство 3" },
	JUMP_TO_WORKSPACE_4: { label: "Переключиться на рабочее пространство 4" },
	JUMP_TO_WORKSPACE_5: { label: "Переключиться на рабочее пространство 5" },
	JUMP_TO_WORKSPACE_6: { label: "Переключиться на рабочее пространство 6" },
	JUMP_TO_WORKSPACE_7: { label: "Переключиться на рабочее пространство 7" },
	JUMP_TO_WORKSPACE_8: { label: "Переключиться на рабочее пространство 8" },
	JUMP_TO_WORKSPACE_9: { label: "Переключиться на рабочее пространство 9" },
	PREV_WORKSPACE: {
		label: "Предыдущее рабочее пространство",
		description: "Перейти к предыдущему рабочему пространству в боковой панели",
	},
	NEXT_WORKSPACE: {
		label: "Следующее рабочее пространство",
		description: "Перейти к следующему рабочему пространству в боковой панели",
	},
	CLOSE_WORKSPACE: {
		label: "Закрыть рабочее пространство",
		description: "Закрыть или удалить текущее рабочее пространство",
	},
	NEW_WORKSPACE: {
		label: "Новое рабочее пространство",
		description: "Открыть окно создания рабочего пространства",
	},
	QUICK_CREATE_WORKSPACE: {
		label: "Быстро создать рабочее пространство",
		description: "Быстро создать рабочее пространство в текущем проекте",
	},
	RUN_WORKSPACE_COMMAND: {
		label: "Запустить команду рабочего пространства",
		description: "Запустить или остановить команду рабочего пространства",
	},
	FOCUS_TASK_SEARCH: {
		label: "Перейти к поиску задач",
		description: "Перевести фокус в поле поиска на экране задач",
	},
	OPEN_PROJECT: {
		label: "Открыть проект",
		description: "Открыть существующую папку проекта",
	},
	OPEN_PR: {
		label: "Открыть pull request",
		description: "Открыть существующий PR или создать новый на GitHub",
	},
	TOGGLE_SIDEBAR: { label: "Показать или скрыть вкладку изменений" },
	OPEN_DIFF_VIEWER: {
		label: "Открыть просмотр diff",
		description:
			"Открыть просмотр diff в новой вкладке или перейти к уже открытому просмотру",
	},
	TOGGLE_WORKSPACE_SIDEBAR: {
		label: "Показать или скрыть боковую панель рабочих пространств",
	},
	SPLIT_RIGHT: {
		label: "Разделить вправо",
		description: "Разделить текущую панель вправо",
	},
	SPLIT_DOWN: {
		label: "Разделить вниз",
		description: "Разделить текущую панель вниз",
	},
	SPLIT_AUTO: {
		label: "Разделить панель автоматически",
		description: "Разделить текущую панель по более длинной стороне",
	},
	SPLIT_WITH_CHAT: {
		label: "Разделить с новым чатом",
		description: "Разделить текущую панель и открыть новую панель чата",
	},
	SPLIT_WITH_BROWSER: {
		label: "Разделить с новым браузером",
		description: "Разделить текущую панель и открыть новую панель браузера",
	},
	EQUALIZE_PANE_SPLITS: {
		label: "Выровнять размеры панелей",
		description: "Сделать все панели одинакового размера",
	},
	CLOSE_PANE: {
		label: "Закрыть панель",
		description: "Закрыть текущую панель",
	},
	FIND_IN_TERMINAL: {
		label: "Найти в терминале",
		description: "Искать текст в активном терминале",
	},
	FIND_IN_FILE_VIEWER: {
		label: "Найти в просмотре файла",
		description: "Искать текст в отрендеренном просмотре файла",
	},
	FIND_IN_CHAT: {
		label: "Найти в чате",
		description: "Искать текст в активном чате",
	},
	NEW_GROUP: { label: "Новый терминал" },
	NEW_CHAT: { label: "Новый чат" },
	REOPEN_TAB: { label: "Открыть закрытую вкладку заново" },
	NEW_BROWSER: { label: "Новый браузер" },
	CLOSE_TERMINAL: { label: "Закрыть терминал" },
	CLOSE_TAB: {
		label: "Закрыть вкладку",
		description: "Закрыть текущую вкладку",
	},
	CLEAR_TERMINAL: { label: "Очистить терминал" },
	SCROLL_TO_BOTTOM: {
		label: "Прокрутить вниз",
		description: "Прокрутить активный терминал вниз",
	},
	PREV_TAB_ALT: { label: "Предыдущая вкладка (Alt)" },
	NEXT_TAB_ALT: { label: "Следующая вкладка (Alt)" },
	PREV_TAB: {
		label: "Предыдущая вкладка",
		description: "Перейти к предыдущей вкладке в активном рабочем пространстве",
	},
	NEXT_TAB: {
		label: "Следующая вкладка",
		description: "Перейти к следующей вкладке в активном рабочем пространстве",
	},
	FOCUS_PANE_LEFT: {
		label: "Фокус на панель слева",
		description: "Перевести фокус на панель слева от активной",
	},
	FOCUS_PANE_RIGHT: {
		label: "Фокус на панель справа",
		description: "Перевести фокус на панель справа от активной",
	},
	FOCUS_PANE_UP: {
		label: "Фокус на панель выше",
		description: "Перевести фокус на панель над активной",
	},
	FOCUS_PANE_DOWN: {
		label: "Фокус на панель ниже",
		description: "Перевести фокус на панель под активной",
	},
	JUMP_TO_TAB_1: { label: "Переключиться на вкладку 1" },
	JUMP_TO_TAB_2: { label: "Переключиться на вкладку 2" },
	JUMP_TO_TAB_3: { label: "Переключиться на вкладку 3" },
	JUMP_TO_TAB_4: { label: "Переключиться на вкладку 4" },
	JUMP_TO_TAB_5: { label: "Переключиться на вкладку 5" },
	JUMP_TO_TAB_6: { label: "Переключиться на вкладку 6" },
	JUMP_TO_TAB_7: { label: "Переключиться на вкладку 7" },
	JUMP_TO_TAB_8: { label: "Переключиться на вкладку 8" },
	JUMP_TO_TAB_9: { label: "Переключиться на вкладку 9" },
	OPEN_PRESET_1: { label: "Открыть пресет 1" },
	OPEN_PRESET_2: { label: "Открыть пресет 2" },
	OPEN_PRESET_3: { label: "Открыть пресет 3" },
	OPEN_PRESET_4: { label: "Открыть пресет 4" },
	OPEN_PRESET_5: { label: "Открыть пресет 5" },
	OPEN_PRESET_6: { label: "Открыть пресет 6" },
	OPEN_PRESET_7: { label: "Открыть пресет 7" },
	OPEN_PRESET_8: { label: "Открыть пресет 8" },
	OPEN_PRESET_9: { label: "Открыть пресет 9" },
	FOCUS_CHAT_INPUT: { label: "Перейти к вводу в чате" },
	CHAT_ADD_ATTACHMENT: { label: "Добавить вложение" },
	OPEN_IN_APP: {
		label: "Открыть в приложении",
		description:
			"Открыть рабочее пространство во внешнем приложении (Cursor, VS Code и т. д.)",
	},
	COPY_PATH: {
		label: "Скопировать путь",
		description: "Скопировать путь рабочего пространства в буфер обмена",
	},
	OPEN_SETTINGS: { label: "Открыть настройки" },
	SHOW_HOTKEYS: { label: "Показать горячие клавиши" },
	OPEN_COMMAND_PALETTE: {
		label: "Открыть палитру команд",
		description: "Открыть глобальную палитру команд (также CAPS LOCK)",
	},
};

function getHotkeyText(id: HotkeyId) {
	const text = HOTKEY_TEXT[id];
	return {
		label: text?.label ?? HOTKEYS[id].label,
		description: text?.description ?? HOTKEYS[id].description,
	};
}

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
	const animate = useShouldAnimate("decorative");

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
				<motion.button
					type="button"
					onClick={onStartRecording}
					className={cn(
						"h-7 px-3 rounded-md border text-xs transition-colors",
						isRecording
							? "border-destructive/50 bg-destructive/10 text-destructive ring-2 ring-destructive/20"
							: "border-border bg-accent/20 text-foreground hover:bg-accent/40",
					)}
					animate={
						isRecording && animate
							? { scale: [1, 1.03, 1], opacity: [1, 0.85, 1] }
							: false
					}
					transition={
						isRecording && animate
							? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
							: undefined
					}
				>
					<AnimatePresence initial={false} mode="wait">
						{isRecording ? (
							<motion.span
								key="recording"
								initial={animate ? { opacity: 0 } : false}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: motionDuration.fast }}
							>
								Нажмите клавишу...
							</motion.span>
						) : (
							<motion.span
								key="keys"
								initial={animate ? { opacity: 0 } : false}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: motionDuration.fast }}
							>
								<KeyCapGroup keys={keys} />
							</motion.span>
						)}
					</AnimatePresence>
				</motion.button>
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
		const text = getHotkeyText(id as HotkeyId);
		grouped[hotkey.category as HotkeyCategory].push({
			id: id as HotkeyId,
			label: text.label,
			description: text.description,
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
					[hotkey.label, hotkey.description]
						.filter(Boolean)
						.some((text) => text?.toLowerCase().includes(lower)),
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
	const animate = useShouldAnimate("decorative");

	return (
		<motion.div
			className="p-6 max-w-4xl w-full"
			initial={animate ? { opacity: 0, y: 4 } : false}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: motionDuration.base, ease: ease.standard }}
		>
			{/* Header */}
			<div className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Горячие клавиши</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Настройте горячие клавиши под свой рабочий процесс. Нажмите{" "}
						<KbdGroup>
							{showHotkeysKeys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>{" "}
						чтобы открыть эту страницу в любой момент.
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
						Адаптация к раскладке клавиатуры
					</Label>
					<p className="text-xs text-muted-foreground">
						Привязывает горячие клавиши к символам на клавиатуре (например, ⌘Z
						всегда срабатывает на клавише с надписью "Z" — физическая KeyY на
						QWERTZ). Если выключено, горячие клавиши привязаны к физическому
						положению клавиш и игнорируют текущий источник ввода.
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
			<motion.div
				className="space-y-6"
				variants={staggerContainer}
				initial={animate ? "hidden" : false}
				animate="visible"
			>
				{CATEGORY_ORDER.map((category) => {
					const hotkeys = filteredHotkeysByCategory[category] ?? [];
					if (hotkeys.length === 0) return null;

					return (
						<motion.div key={category} variants={staggerItem}>
							<h3 className="text-sm font-medium text-muted-foreground mb-2">
								{CATEGORY_LABELS[category]}
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
						</motion.div>
					);
				})}

				{CATEGORY_ORDER.every(
					(cat) => (filteredHotkeysByCategory[cat] ?? []).length === 0,
				) && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Не найдено горячих клавиш по запросу "{searchQuery}"
					</div>
				)}
			</motion.div>

			{/* Conflict dialog */}
			<AlertDialog
				open={!!pendingConflict}
				onOpenChange={() => setPendingConflict(null)}
			>
				<AlertDialogContent className="max-w-[380px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Горячая клавиша уже используется
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									{pendingConflict
										? `${conflictDisplay.text} уже назначен на "${
												getHotkeyText(pendingConflict.conflictId).label
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
		</motion.div>
	);
}
