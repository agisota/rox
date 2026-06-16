import {
	type IntegrationRegistryId,
	integrationCatalog,
} from "@rox/shared/integrations";
import {
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

export interface IntegrationSettingsRow {
	provider: IntegrationRegistryId;
	name: string;
	description: string;
	managePath: string;
	settingItemId: SettingItemId;
}

const INTEGRATION_SETTING_ITEM_ID = {
	linear: SETTING_ITEM_ID.INTEGRATIONS_LINEAR,
	github: SETTING_ITEM_ID.INTEGRATIONS_GITHUB,
	slack: SETTING_ITEM_ID.INTEGRATIONS_SLACK,
	telegram: SETTING_ITEM_ID.INTEGRATIONS_TELEGRAM,
	discord: SETTING_ITEM_ID.INTEGRATIONS_DISCORD,
	notion: SETTING_ITEM_ID.INTEGRATIONS_NOTION,
	obsidian: SETTING_ITEM_ID.INTEGRATIONS_OBSIDIAN,
	fibery: SETTING_ITEM_ID.INTEGRATIONS_FIBERY,
	lark: SETTING_ITEM_ID.INTEGRATIONS_LARK,
} satisfies Record<IntegrationRegistryId, SettingItemId>;

const INTEGRATION_DESCRIPTION = {
	linear: "Синхронизируйте задачи с Linear в обе стороны.",
	github: "Подключайте репозитории и синхронизируйте pull requests.",
	slack: "Управляйте задачами из переписок Slack.",
	telegram: "Запускайте агентов через Telegram-бота в любом чате.",
	discord: "Запускайте агентов с Discord-сервера.",
	notion: "Синхронизируйте документы и базы данных с Notion.",
	obsidian: "Синхронизируйте заметки с локальным vault Obsidian.",
	fibery: "Подключите рабочее пространство Fibery через токен аккаунта.",
	lark: "Подключите Lark (Feishu) для сообщений и документов.",
} satisfies Record<IntegrationRegistryId, string>;

export function getIntegrationSettingsRows(): IntegrationSettingsRow[] {
	return integrationCatalog.map((meta) => ({
		provider: meta.id as IntegrationRegistryId,
		name: meta.name,
		description: INTEGRATION_DESCRIPTION[meta.id as IntegrationRegistryId],
		managePath: `/integrations/${meta.id}`,
		settingItemId:
			INTEGRATION_SETTING_ITEM_ID[meta.id as IntegrationRegistryId],
	}));
}
