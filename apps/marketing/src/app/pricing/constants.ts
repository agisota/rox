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
		description: "Для индивидуальной работы и первого запуска",
		price: { kind: "fixed", display: "$0", note: "Бесплатно для всех" },
		features: [
			"1 пользователь",
			"Локальные рабочие пространства",
			"Настольное приложение",
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
		description: "Для команд, которым нужна большая мощность",
		price: {
			kind: "variable",
			monthly: {
				display: "$20",
				note: "за пользователя в месяц",
				cadence: "Оплата каждый месяц",
			},
			yearly: {
				display: "$15",
				note: "за пользователя в месяц",
				cadence: "Оплата раз в год",
			},
		},
		features: [
			"Все возможности бесплатного тарифа",
			"Пользователи без ограничений",
			"Удаленные рабочие пространства",
			"Интеграция с Linear",
			"Мобильное приложение (скоро)",
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
		name: "Корпоративный",
		description: "Для организаций с расширенными требованиями",
		price: {
			kind: "custom",
			display: "Индивидуально",
			note: "Оплата раз в год",
		},
		features: [
			"Все возможности Pro",
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
				label: "Рабочие пространства",
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
			{ label: "Настольное приложение", values: [true, true, true] },
			{ label: "Локальные рабочие пространства", values: [true, true, true] },
			{
				label: "Удаленные рабочие пространства",
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
			{ label: "Интеграция с Slack", values: [null, true, true] },
			{ label: "Командная совместная работа", values: [null, true, true] },
		],
	},
	{
		title: "Поддержка",
		rows: [
			{ label: "Приоритетная поддержка", values: [null, null, true] },
			{ label: "SLA по доступности", values: [null, null, true] },
			{ label: "Индивидуальные договоры", values: [null, null, true] },
		],
	},
	{
		title: "Безопасность",
		rows: [
			{ label: "SSO/SAML", values: [null, null, true] },
			{ label: "Ограничения по IP", values: [null, null, true] },
			{ label: "Провижининг SCIM", values: [null, null, true] },
			{ label: "Журнал аудита", values: [null, null, true] },
		],
	},
];

export const PRICING_FAQ_ITEMS: FAQItem[] = [
	{
		question: "Есть ли бесплатный тариф?",
		answer:
			"Да. Бесплатный тариф подходит для индивидуальной работы: 1 пользователь, локальные рабочие пространства, настольное приложение и интеграция с GitHub. Банковская карта не нужна.",
	},
	{
		question: "Как устроены цены Pro?",
		answer:
			"Pro стоит 20 $ за пользователя в месяц при ежемесячной оплате или 15 $ за пользователя в месяц при оплате за год (скидка 25%). Оплата считается по активным местам в твоей команде.",
	},
	{
		question: "Можно ли сменить тариф или отменить подписку в любой момент?",
		answer:
			"Да. Ты можешь повысить тариф, перейти на более простой тариф или отменить подписку в любой момент в настройках оплаты внутри приложения. Изменения вступают в силу в конце текущего расчетного периода.",
	},
	{
		question: "Что входит в корпоративный тариф?",
		answer:
			"Все возможности Pro, а также SSO и SAML, провижининг SCIM, ограничения по IP, журналы аудита, индивидуальный SLA, выделенная поддержка и индивидуальные договоры. Цена подбирается под твою организацию: свяжись с нами, и мы вместе определим подходящий объем.",
	},
];
