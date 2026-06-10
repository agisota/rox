import { toast } from "@rox/ui/sonner";
import { useCallback } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { LinkTierMap } from "renderer/lib/clickPolicy";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { LinkTierMapper } from "../LinkTierMapper";

interface LinksSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function LinksSettings({ visibleItems }: LinksSettingsProps) {
	const { preferences, setFileLinks, setUrlLinks, setSidebarFileLinks } =
		useV2UserPreferences();

	const showFile = isItemVisible(SETTING_ITEM_ID.LINKS_FILE, visibleItems);
	const showUrl = isItemVisible(SETTING_ITEM_ID.LINKS_URL, visibleItems);
	const showSidebar = isItemVisible(
		SETTING_ITEM_ID.LINKS_SIDEBAR_FILE,
		visibleItems,
	);

	const handleFileChange = useCallback(
		(next: LinkTierMap) => {
			setFileLinks(next);
			toast.success("Изменения сохранены");
		},
		[setFileLinks],
	);

	const handleUrlChange = useCallback(
		(next: LinkTierMap) => {
			setUrlLinks(next);
			toast.success("Изменения сохранены");
		},
		[setUrlLinks],
	);

	const handleSidebarChange = useCallback(
		(next: LinkTierMap) => {
			setSidebarFileLinks(next);
			toast.success("Изменения сохранены");
		},
		[setSidebarFileLinks],
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Ссылки</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Настройте, что делает каждый клик по файлу или URL — обычный или с
					модификатором. Каждая строка связывает сочетание модификаторов с
					действием.
				</p>
			</div>

			<div className="space-y-6">
				{showSidebar && (
					<LinkTierMapper
						title="Строки файлов в боковой панели"
						description="Применяется к дереву файлов, списку изменений, заголовку diff и бейджам портов."
						value={preferences.sidebarFileLinks}
						onChange={handleSidebarChange}
						idPrefix="links-sidebar-file"
						surface="file"
					/>
				)}

				{showFile && (
					<LinkTierMapper
						title="Ссылки на файлы"
						description="Применяется к путям файлов в терминалах, вызовах инструментов чата и Markdown задач."
						value={preferences.fileLinks}
						onChange={handleFileChange}
						idPrefix="links-file"
						surface="file"
					/>
				)}

				{showUrl && (
					<LinkTierMapper
						title="URL-ссылки"
						description="Применяется к URL в терминалах, сообщениях чата и браузерах задач."
						value={preferences.urlLinks}
						onChange={handleUrlChange}
						idPrefix="links-url"
						surface="url"
					/>
				)}
			</div>
		</div>
	);
}
