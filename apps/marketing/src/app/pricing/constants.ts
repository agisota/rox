import type { FAQItem } from "@/app/components/FAQSection";

export type TierId = "free" | "pro" | "enterprise";

export interface PricingTier {
	id: TierId;
	name: string;
	description: string;
	price:
		| { kind: "fixed"; display: string; note: string }
		| {
				kind: "variable";
				monthly: { display: string; note: string; cadence: string };
				yearly: { display: string; note: string; cadence: string };
		  }
		| { kind: "custom"; display: string; note: string };
	features: string[];
	featureLimits?: Partial<Record<string, string>>;
	cta: {
		label: string;
		href: string;
		variant: "default" | "outline" | "secondary";
		external?: boolean;
	};
	highlight?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
	{
		id: "free",
		name: "Бесплатно",
		description: "Для тех, кто только начинает",
		price: { kind: "fixed", display: "$0", note: "Бесплатно для всех" },
		features: [
			"1 пользователь",
			"Локальные воркспейсы",
			"Десктопное приложение",
			"Интеграция с GitHub",
			"CLI (скоро)",
		],
		cta: {
			label: "Скачать приложение",
			href: "/download",
			variant: "outline",
		},
	},
	{
		id: "pro",
		name: "Pro",
		description: "Для команд, которым нужно больше возможностей",
		price: {
			kind: "variable",
			monthly: {
				display: "$20",
				note: "за пользователя/месяц",
				cadence: "Оплата ежемесячно",
			},
			yearly: {
				display: "$15",
				note: "за пользователя/месяц",
				cadence: "Оплата ежегодно",
			},
		},
		features: [
			"Все из бесплатного плана",
			"Неограниченное число пользователей",
			"Удаленные воркспейсы",
			"Интеграция с Linear",
			"Mobile (скоро)",
		],
		cta: {
			label: "Скачать приложение",
			href: "/download",
			variant: "default",
		},
		highlight: true,
	},
	{
		id: "enterprise",
		name: "Enterprise",
		description: "Для организаций со сложными требованиями",
		price: {
			kind: "custom",
			display: "Индивидуальная цена",
			note: "Оплата ежегодно",
		},
		features: [
			"Все из Pro",
			"SSO и расширенная безопасность",
			"Журналы аудита",
			"SLA и выделенная поддержка",
			"Индивидуальные интеграции",
		],
		cta: {
			label: "Связаться с отделом продаж",
			href: "/enterprise",
			variant: "outline",
		},
	},
];

export interface ComparisonRow {
	label: string;
	values: [
		string | boolean | null,
		string | boolean | null,
		string | boolean | null,
	];
	badge?: { label: string; variant: "default" | "secondary" };
}

export interface ComparisonSection {
	title: string;
	rows: ComparisonRow[];
}

export const COMPARISON_SECTIONS: ComparisonSection[] = [
	{
		title: "Использование",
		rows: [
			{
				label: "Участники команды",
				values: ["1", "Без ограничений", "Без ограничений"],
			},
			{
				label: "Воркспейсы",
				values: ["Без ограничений", "Без ограничений", "Без ограничений"],
			},
			{
				label: "Проекты",
				values: ["Без ограничений", "Без ограничений", "Без ограничений"],
			},
		],
	},
	{
		title: "Возможности",
		rows: [
			{ label: "Desktop app", values: [true, true, true] },
			{ label: "Локальные воркспейсы", values: [true, true, true] },
			{
				label: "Удаленные воркспейсы",
				values: [null, true, true],
				badge: { label: "Бета", variant: "default" },
			},
			{ label: "Автоматизации", values: [true, true, true] },
			{
				label: "Мобильное приложение",
				values: [null, true, true],
				badge: { label: "Скоро", variant: "secondary" },
			},
			{ label: "Интеграция с GitHub", values: [true, true, true] },
			{ label: "Интеграция с Linear", values: [null, true, true] },
			{ label: "Интеграция со Slack", values: [null, true, true] },
			{ label: "Командная работа", values: [null, true, true] },
		],
	},
	{
		title: "Поддержка",
		rows: [
			{ label: "Приоритетная поддержка", values: [null, null, true] },
			{ label: "Uptime SLA", values: [null, null, true] },
			{ label: "Индивидуальные договоры", values: [null, null, true] },
		],
	},
	{
		title: "Безопасность",
		rows: [
			{ label: "SSO/SAML", values: [null, null, true] },
			{ label: "Ограничения по IP", values: [null, null, true] },
			{ label: "SCIM provisioning", values: [null, null, true] },
			{ label: "Журнал аудита", values: [null, null, true] },
		],
	},
];

export const PRICING_FAQ_ITEMS: FAQItem[] = [
	{
		question: "Есть ли бесплатный план?",
		answer:
			"Да. Бесплатный план подходит одному пользователю и включает локальные воркспейсы, Desktop app и интеграцию с GitHub. Банковская карта не нужна.",
	},
	{
		question: "Как устроена цена Pro?",
		answer:
			"Pro стоит $20 за пользователя в месяц при ежемесячной оплате или $15 за пользователя в месяц при ежегодной оплате (скидка 25%). Оплата считается по активным местам в команде.",
	},
	{
		question: "Можно ли сменить план или отменить подписку в любой момент?",
		answer:
			"Да. Вы можете повысить, понизить или отменить план в любой момент в настройках биллинга внутри приложения. Изменения вступят в силу в конце текущего расчетного периода.",
	},
	{
		question: "Что входит в Enterprise?",
		answer:
			"Все из Pro, а также SSO и SAML, SCIM provisioning, ограничения по IP, журналы аудита, индивидуальный SLA, выделенная поддержка и индивидуальные договоры. Цена подбирается под вашу организацию — свяжитесь с нами, и мы предложим подходящий вариант.",
	},
];
