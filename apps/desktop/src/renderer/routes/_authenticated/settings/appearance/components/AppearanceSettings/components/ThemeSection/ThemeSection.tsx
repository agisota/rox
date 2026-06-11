import { COMPANY } from "@rox/shared/constants";
import { Button } from "@rox/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { type ChangeEvent, useRef, useState } from "react";
import {
	HiOutlineArrowDownTray,
	HiOutlineArrowTopRightOnSquare,
	HiOutlineArrowUpTray,
} from "react-icons/hi2";
import { ThemeSwatch } from "renderer/components/ThemeSwatch";
import { AnimatedHeight } from "renderer/motion";
import {
	SYSTEM_THEME_ID,
	useSetSystemThemePreference,
	useSetTheme,
	useSystemDarkThemeId,
	useSystemLightThemeId,
	useThemeId,
	useThemeStore,
} from "renderer/stores";
import {
	builtInThemes,
	darkTheme as defaultDarkTheme,
	lightTheme as defaultLightTheme,
	getTerminalColors,
	parseThemeConfigFile,
	type Theme,
} from "shared/themes";
import { ThemeLibraryCombobox } from "./components/ThemeLibraryCombobox";

const MAX_THEME_FILE_SIZE = 256 * 1024; // 256 KB

function ThemeOptionRow({ theme }: { theme: Theme }) {
	return (
		<div className="flex items-center gap-2 min-w-0">
			<ThemeSwatch theme={theme} />
			<span className="truncate">{theme.name}</span>
		</div>
	);
}

interface ThemeRowProps {
	label: string;
	hint: React.ReactNode;
	value: string;
	onValueChange: (value: string) => void;
	currentTheme: Theme;
	options: ReadonlyArray<{ group: string; themes: Theme[] }>;
	includeSystem?: {
		darkTheme: Theme;
		lightTheme: Theme;
	};
}

function ThemeRow({
	label,
	hint,
	value,
	onValueChange,
	currentTheme,
	options,
	includeSystem,
}: ThemeRowProps) {
	const isSystem = includeSystem !== undefined && value === SYSTEM_THEME_ID;
	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{label}</div>
				<div className="text-xs text-muted-foreground">{hint}</div>
			</div>
			<Select value={value} onValueChange={onValueChange}>
				<SelectTrigger size="sm" className="w-auto min-w-44 px-2">
					<SelectValue>
						{isSystem ? (
							<div className="flex items-center gap-2 min-w-0">
								<div className="flex shrink-0 -space-x-1">
									<ThemeSwatch theme={includeSystem.lightTheme} />
									<ThemeSwatch theme={includeSystem.darkTheme} />
								</div>
								<span className="truncate text-xs">Системная</span>
							</div>
						) : (
							<div className="flex items-center gap-2 min-w-0">
								<ThemeSwatch theme={currentTheme} />
								<span className="truncate text-xs">{currentTheme.name}</span>
							</div>
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent className="max-h-[320px]">
					{includeSystem && (
						<>
							<SelectItem value={SYSTEM_THEME_ID}>
								<div className="flex items-center gap-2 min-w-0">
									<div className="flex shrink-0 -space-x-1">
										<ThemeSwatch theme={includeSystem.lightTheme} />
										<ThemeSwatch theme={includeSystem.darkTheme} />
									</div>
									<span className="truncate">Системная</span>
								</div>
							</SelectItem>
							<SelectSeparator />
						</>
					)}
					{options.map((group, idx) => (
						<SelectGroup key={group.group}>
							{idx > 0 && <SelectSeparator />}
							<SelectLabel className="text-xs text-muted-foreground">
								{group.group}
							</SelectLabel>
							{group.themes.map((theme) => (
								<SelectItem key={theme.id} value={theme.id}>
									<ThemeOptionRow theme={theme} />
								</SelectItem>
							))}
						</SelectGroup>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function ThemeSection() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const customThemes = useThemeStore((state) => state.customThemes);
	const upsertCustomThemes = useThemeStore((state) => state.upsertCustomThemes);
	const systemLightThemeId = useSystemLightThemeId();
	const systemDarkThemeId = useSystemDarkThemeId();
	const setSystemThemePreference = useSetSystemThemePreference();

	const allThemes = [...builtInThemes, ...customThemes];
	const lightThemes = allThemes.filter((t) => t.type === "light");
	const darkThemes = allThemes.filter((t) => t.type === "dark");
	const builtInLightThemes = lightThemes.filter((t) => !t.isCustom);
	const builtInDarkThemes = darkThemes.filter((t) => !t.isCustom);
	const customLightThemes = lightThemes.filter((t) => t.isCustom);
	const customDarkThemes = darkThemes.filter((t) => t.isCustom);

	const allOptions: ReadonlyArray<{ group: string; themes: Theme[] }> = [
		{ group: "Светлые", themes: builtInLightThemes },
		{ group: "Темные", themes: builtInDarkThemes },
		...(customThemes.length > 0
			? [
					{
						group: "Пользовательские",
						themes: [...customLightThemes, ...customDarkThemes],
					},
				]
			: []),
	];
	const lightOptions: ReadonlyArray<{ group: string; themes: Theme[] }> =
		customLightThemes.length > 0
			? [
					{ group: "Светлые", themes: builtInLightThemes },
					{ group: "Пользовательские", themes: customLightThemes },
				]
			: [{ group: "Светлые", themes: builtInLightThemes }];
	const darkOptions: ReadonlyArray<{ group: string; themes: Theme[] }> =
		customDarkThemes.length > 0
			? [
					{ group: "Темные", themes: builtInDarkThemes },
					{ group: "Пользовательские", themes: customDarkThemes },
				]
			: [{ group: "Темные", themes: builtInDarkThemes }];

	const systemLightTheme =
		allThemes.find((t) => t.id === systemLightThemeId) ??
		builtInThemes.find((t) => t.id === "light") ??
		defaultLightTheme;
	const systemDarkTheme =
		allThemes.find((t) => t.id === systemDarkThemeId) ??
		builtInThemes.find((t) => t.id === "dark") ??
		defaultDarkTheme;

	const isSystemMode = activeThemeId === SYSTEM_THEME_ID;
	const currentTheme =
		allThemes.find((t) => t.id === activeThemeId) ?? systemDarkTheme;

	const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		if (file.size > MAX_THEME_FILE_SIZE) {
			toast.error("Файл темы слишком большой", {
				description: "Максимальный размер — 256 KB.",
			});
			return;
		}

		setIsImporting(true);
		try {
			const content = await file.text();
			const parsed = parseThemeConfigFile(content);

			if (!parsed.ok) {
				toast.error("Не удалось импортировать файл темы", {
					description: parsed.error,
				});
				return;
			}

			const summary = upsertCustomThemes(parsed.themes);
			const totalImported = summary.added + summary.updated;

			if (totalImported === 0) {
				toast.error("Темы не импортированы", {
					description:
						summary.skipped > 0
							? "Все темы используют зарезервированные ID (встроенные или системные)."
							: "В файле нет тем, доступных для импорта.",
				});
				return;
			}

			toast.success(
				totalImported === 1
					? "Импортирована 1 пользовательская тема"
					: `Импортировано пользовательских тем: ${totalImported}`,
				{
					description:
						summary.updated > 0
							? `Обновлено существующих тем: ${summary.updated}`
							: undefined,
				},
			);

			if (parsed.issues.length > 0) {
				toast.warning("Некоторые темы пропущены", {
					description: parsed.issues[0],
				});
			}
		} catch (error) {
			toast.error("Не удалось импортировать файл темы", {
				description:
					error instanceof Error ? error.message : "Не удалось прочитать файл",
			});
		} finally {
			setIsImporting(false);
		}
	};

	const handleDownloadBaseTheme = () => {
		const baseTheme = activeTheme ?? builtInThemes[0];
		if (!baseTheme) return;

		const baseConfig = {
			id: "my-custom-theme",
			name: "Моя пользовательская тема",
			type: baseTheme.type,
			author: "Вы",
			description: "Пользовательская тема Rox",
			ui: baseTheme.ui,
			terminal: getTerminalColors(baseTheme),
		};

		const blob = new Blob([JSON.stringify(baseConfig, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "rox-theme-base.json";
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
			<ThemeRow
				label="Тема"
				hint={
					<>
						Выберите тему или следуйте системному оформлению. Откройте{" "}
						<a
							href={`${COMPANY.MARKETING_URL}/marketplace/themes`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-0.5 text-primary hover:underline"
						>
							маркетплейс
							<HiOutlineArrowTopRightOnSquare className="h-3 w-3" />
						</a>{" "}
						или{" "}
						<a
							href={`${COMPANY.DOCS_URL}/custom-themes`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-0.5 text-primary hover:underline"
						>
							документацию
							<HiOutlineArrowTopRightOnSquare className="h-3 w-3" />
						</a>
						.
					</>
				}
				value={activeThemeId}
				onValueChange={setTheme}
				currentTheme={currentTheme}
				options={allOptions}
				includeSystem={{
					darkTheme: systemDarkTheme,
					lightTheme: systemLightTheme,
				}}
			/>
			<AnimatedHeight open={isSystemMode}>
				<ThemeRow
					label="Светлая тема"
					hint="Используется, когда система в светлом режиме."
					value={systemLightThemeId}
					onValueChange={(id) => setSystemThemePreference("light", id)}
					currentTheme={systemLightTheme}
					options={lightOptions}
				/>
				<ThemeRow
					label="Темная тема"
					hint="Используется, когда система в темном режиме."
					value={systemDarkThemeId}
					onValueChange={(id) => setSystemThemePreference("dark", id)}
					currentTheme={systemDarkTheme}
					options={darkOptions}
				/>
			</AnimatedHeight>
			<div className="flex items-center justify-between gap-6 p-4">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">Библиотека тем</div>
					<div className="text-xs text-muted-foreground">
						Ищите среди сотен тем сообщества с живым предпросмотром.
					</div>
				</div>
				<ThemeLibraryCombobox
					activeThemeId={activeThemeId}
					onSelect={setTheme}
				/>
			</div>
			<div className="flex items-center justify-between gap-6 p-4">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">Пользовательские темы</div>
					<div className="text-xs text-muted-foreground">
						Импортируйте файл темы или скачайте шаблон для редактирования.
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<input
						ref={fileInputRef}
						type="file"
						accept=".json,application/json"
						className="hidden"
						onChange={handleImport}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleDownloadBaseTheme}
					>
						<HiOutlineArrowDownTray className="mr-1.5 h-4 w-4" />
						Скачать шаблон
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isImporting}
					>
						<HiOutlineArrowUpTray className="mr-1.5 h-4 w-4" />
						{isImporting ? "Импорт..." : "Импорт"}
					</Button>
				</div>
			</div>
		</div>
	);
}
