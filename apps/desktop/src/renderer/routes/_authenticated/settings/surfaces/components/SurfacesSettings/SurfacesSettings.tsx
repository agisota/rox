import { Switch } from "@rox/ui/switch";
import {
	TOGGLEABLE_SURFACES,
	useSurfaceVisibilityStore,
} from "renderer/stores/surface-visibility";
import {
	SettingsCard,
	SettingsCardHeader,
	SettingsRow,
} from "../../../components/SettingsCard";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface SurfacesSettingsProps {
	/** Settings-search filter: ids of items to show, or null for "show all". */
	visibleItems?: SettingItemId[] | null;
}

/**
 * Settings → Поверхности.
 *
 * Per-surface toggles for the secondary destinations in the dashboard sidebar.
 * Every surface is hidden by default (see {@link useSurfaceVisibilityStore});
 * this page lets the user opt each one back into the rail. State is read from
 * and written to the shared visibility store, which the sidebar subscribes to,
 * so toggles take effect immediately.
 */
export function SurfacesSettings({ visibleItems }: SurfacesSettingsProps) {
	const visibility = useSurfaceVisibilityStore((state) => state.visibility);
	const setVisible = useSurfaceVisibilityStore((state) => state.setVisible);

	const showCard = isItemVisible(
		SETTING_ITEM_ID.SURFACES_SIDEBAR,
		visibleItems,
	);

	if (!showCard) return null;

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Поверхности</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Выберите, какие дополнительные разделы показывать на боковой панели.
					По умолчанию они скрыты, чтобы панель оставалась сфокусированной.
				</p>
			</div>

			<SettingsCard
				header={
					<SettingsCardHeader
						title="Разделы боковой панели"
						description="Переключатели включают разделы в левой панели дашборда"
					/>
				}
			>
				{TOGGLEABLE_SURFACES.map((surface) => {
					const inputId = `surface-toggle-${surface.id}`;
					return (
						<SettingsRow
							key={surface.id}
							htmlFor={inputId}
							label={surface.label}
							hint={surface.hint}
						>
							<Switch
								id={inputId}
								checked={visibility[surface.id] ?? false}
								onCheckedChange={(checked) => setVisible(surface.id, checked)}
								aria-label={`Показывать раздел «${surface.label}»`}
							/>
						</SettingsRow>
					);
				})}
			</SettingsCard>
		</div>
	);
}
