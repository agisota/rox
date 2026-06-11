import { Button } from "@rox/ui/button";
import { Label } from "@rox/ui/label";
import { Switch } from "@rox/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import {
	useIsV2CloudEnabled,
	useIsV2OnlyUser,
} from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { useOpenV1ImportModal } from "renderer/stores/v1-import-modal";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { AnimationAuditPanel } from "../AnimationAuditPanel";

interface ExperimentalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ExperimentalSettings({
	visibleItems,
}: ExperimentalSettingsProps) {
	const showRoxV2 = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_ROX_V2,
		visibleItems,
	);
	const showV1Migration = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION,
		visibleItems,
	);
	const showRerunOnboarding = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_RERUN_ONBOARDING,
		visibleItems,
	);
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const isV2OnlyUser = useIsV2OnlyUser();
	const setOptInV2 = useV2LocalOverrideStore((state) => state.setOptInV2);
	const openV1ImportModal = useOpenV1ImportModal();
	const navigate = useNavigate();

	const handleRerunOnboarding = () => {
		track("onboarding_rerun_opened");
		void navigate({ to: "/onboarding", search: { rerun: true } });
	};

	return (
		<div className="p-6 max-w-4xl w-full mx-auto">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Экспериментальные функции</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Попробуйте функции раннего доступа и предварительные версии.
				</p>
			</div>

			<div className="space-y-6">
				{showRoxV2 && !isV2OnlyUser && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label htmlFor="rox-v2" className="text-sm font-medium">
								Попробовать Rox v2
							</Label>
							<p className="text-xs text-muted-foreground">
								Использовать новый интерфейс рабочих пространств.
							</p>
						</div>
						<Switch
							id="rox-v2"
							checked={isV2CloudEnabled}
							onCheckedChange={(enabled) => {
								track("surface_toggled", {
									from: isV2CloudEnabled ? "v2" : "v1",
									to: enabled ? "v2" : "v1",
								});
								setOptInV2(enabled);
							}}
						/>
					</div>
				)}
				{showV1Migration && !isV2OnlyUser && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label className="text-sm font-medium">Импорт из v1</Label>
							<p className="text-xs text-muted-foreground">
								Перенесите проекты, рабочие пространства и пресеты терминала из
								v1 в v2. Каждый элемент импортируется отдельно, импорт можно
								повторить.
							</p>
							{!isV2CloudEnabled && (
								<p className="text-xs text-muted-foreground">
									Доступно после включения v2.
								</p>
							)}
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => openV1ImportModal()}
							disabled={!isV2CloudEnabled}
							className="shrink-0"
						>
							Открыть импорт
						</Button>
					</div>
				)}
				{showRerunOnboarding && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label className="text-sm font-medium">Повторить запуск</Label>
							<p className="text-xs text-muted-foreground">
								Снова откройте мастер запуска, чтобы подключить агентов, GitHub
								CLI и добавить проект. Любой шаг можно пропустить.
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleRerunOnboarding}
							className="shrink-0"
						>
							Открыть запуск
						</Button>
					</div>
				)}
				{import.meta.env.DEV && <AnimationAuditPanel />}
			</div>
		</div>
	);
}
