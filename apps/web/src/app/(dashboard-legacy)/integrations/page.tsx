"use client";

import {
	type IntegrationRegistryId,
	integrationCatalog,
} from "@rox/shared/integrations";
import type { ReactNode } from "react";
import { FaBookOpen, FaComments } from "react-icons/fa";
import {
	SiDiscord,
	SiGithub,
	SiLinear,
	SiNotion,
	SiObsidian,
	SiSlack,
	SiTelegram,
} from "react-icons/si";
import {
	IntegrationCard,
	type IntegrationCardProps,
} from "./components/IntegrationCard";

// Brand icons live in the web bundle (the shared registry stays JSX-free).
const PROVIDER_ICONS: Record<IntegrationRegistryId, ReactNode> = {
	linear: <SiLinear className="size-8" />,
	github: <SiGithub className="size-8" />,
	slack: <SiSlack className="size-8" />,
	telegram: <SiTelegram className="size-8" />,
	discord: <SiDiscord className="size-8" />,
	notion: <SiNotion className="size-8" />,
	obsidian: <SiObsidian className="size-8" />,
	fibery: <FaBookOpen className="size-8" />,
	lark: <FaComments className="size-8" />,
};

const INTEGRATION_COPY: Record<
	IntegrationRegistryId,
	{ description: string; category: string }
> = {
	linear: {
		description: "Двусторонняя синхронизация задач с Linear.",
		category: "Управление задачами",
	},
	github: {
		description: "Подключайте репозитории и синхронизируйте pull requests.",
		category: "Контроль версий",
	},
	slack: {
		description: "Подключите Slack, чтобы управлять задачами из переписок.",
		category: "Коммуникации",
	},
	telegram: {
		description: "Запускайте агентов через Telegram-бота в любом чате.",
		category: "Коммуникации",
	},
	discord: {
		description: "Установите бота и запускайте агентов со своего сервера.",
		category: "Коммуникации",
	},
	notion: {
		description: "Синхронизируйте документы и базы данных с Notion.",
		category: "База знаний",
	},
	obsidian: {
		description: "Синхронизируйте заметки с локальным хранилищем Obsidian.",
		category: "База знаний",
	},
	fibery: {
		description: "Подключите рабочее пространство Fibery через токен аккаунта.",
		category: "Управление задачами",
	},
	lark: {
		description: "Подключите Lark (Feishu) для сообщений и документов.",
		category: "Коммуникации",
	},
};

const integrations: IntegrationCardProps[] = integrationCatalog.map((meta) => ({
	id: meta.id,
	name: meta.name,
	description: INTEGRATION_COPY[meta.id as IntegrationRegistryId].description,
	category: INTEGRATION_COPY[meta.id as IntegrationRegistryId].category,
	accentColor: meta.accentColor,
	icon: PROVIDER_ICONS[meta.id as IntegrationRegistryId],
	disabled: !meta.enabled,
}));

export default function IntegrationsPage() {
	return (
		<div className="space-y-8">
			<section>
				<h2 className="text-xl font-semibold">Рекомендуемые</h2>
				<p className="text-muted-foreground">
					Подборка интеграций, отобранных нашей командой.
				</p>

				<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{integrations.map((integration) => (
						<IntegrationCard key={integration.id} {...integration} />
					))}
				</div>
			</section>
		</div>
	);
}
