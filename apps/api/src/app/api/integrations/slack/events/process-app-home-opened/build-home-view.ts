import type { KnownBlock } from "@slack/types";
import { COMPANY, SERVICE_URLS } from "@superset/shared/constants";
import { DEFAULT_SLACK_MODEL, SLACK_MODELS } from "../../constants";

interface BuildHomeViewParams {
	modelPreference?: string;
	externalOrgName?: string;
	isUserLinked: boolean;
	userName?: string;
	connectUrl?: string;
}

export function buildHomeView({
	modelPreference,
	externalOrgName,
	isUserLinked,
	userName,
	connectUrl,
}: BuildHomeViewParams): { type: "home"; blocks: KnownBlock[] } {
	const currentModel = modelPreference ?? DEFAULT_SLACK_MODEL;
	const currentModelOption =
		SLACK_MODELS.find((m) => m.value === currentModel) ?? SLACK_MODELS[0];

	const blocks: KnownBlock[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: `Добро пожаловать в ${COMPANY.NAME}`,
				emoji: true,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `${COMPANY.NAME} помогает ставить задачи, запускать агентов разработки и проверять изменения, не выходя из Slack.`,
			},
		},
		{ type: "divider" },

		{
			type: "header",
			text: {
				type: "plain_text",
				text: "Настройки",
				emoji: true,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*Модель*\nВыберите модель для разговоров в Slack.",
			},
			accessory: {
				type: "static_select",
				action_id: "model_select",
				placeholder: {
					type: "plain_text",
					text: "Выберите модель",
				},
				options: SLACK_MODELS.map((m) => ({
					text: { type: "plain_text", text: m.label },
					value: m.value,
				})),
				initial_option: {
					text: { type: "plain_text", text: currentModelOption.label },
					value: currentModelOption.value,
				},
			},
		},

		{
			type: "header",
			text: {
				type: "plain_text",
				text: "Аккаунт",
				emoji: true,
			},
		},
	];

	if (isUserLinked && userName) {
		blocks.push(
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `Подключено как *${userName}*${externalOrgName ? ` в ${externalOrgName}` : ""}`,
					},
				],
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						action_id: "disconnect_account",
						text: {
							type: "plain_text",
							text: "Отключить аккаунт",
							emoji: true,
						},
						style: "danger",
						confirm: {
							title: { type: "plain_text", text: "Отключить аккаунт" },
							text: {
								type: "mrkdwn",
								text: `Вы уверены, что хотите отключить аккаунт ${COMPANY.NAME}?`,
							},
							confirm: { type: "plain_text", text: "Отключить" },
							deny: { type: "plain_text", text: "Отмена" },
						},
					},
				],
			},
		);
	} else {
		blocks.push(
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `Свяжите Slack с аккаунтом ${COMPANY.NAME}, чтобы персонализировать работу.`,
				},
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						text: {
							type: "plain_text",
							text: "Подключить аккаунт",
							emoji: true,
						},
						url: connectUrl,
					},
				],
			},
		);
	}

	blocks.push(
		{ type: "divider" },
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "Как начать",
				emoji: true,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Напишите боту в личные сообщения* — получите быстрый доступ к агентам.\n\n*@mention в каналах* — упомяните бота в канале, чтобы дать контекст.\n\n*Предпросмотр ссылок* — вставьте ссылку на задачу ${COMPANY.NAME}, и Slack покажет карточку задачи.`,
			},
		},
		{ type: "divider" },
		{
			type: "actions",
			elements: [
				{
					type: "button",
					text: {
						type: "plain_text",
						text: `Открыть ${COMPANY.NAME}`,
						emoji: true,
					},
					url: SERVICE_URLS.WEB,
					style: "primary",
				},
			],
		},
	);

	return { type: "home", blocks };
}
