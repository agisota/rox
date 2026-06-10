import { PLAN_TIERS, type PlanTier } from "@rox/shared/billing";

export { PLAN_TIERS, type PlanTier };

export interface PlanFeature {
	id: string;
	name: string;
	description?: string;
	included: boolean;
	limit?: string;
}

export interface Plan {
	id: PlanTier;
	name: string;
	description: string;
	price: {
		monthly: number;
		yearly?: number;
	} | null;
	limits: {
		maxUsers: number | null;
		maxWorkspaces: number | null;
		cloudWorkspaces: boolean;
		mobileApp: boolean;
	};
	features: PlanFeature[];
	cta: {
		text: string;
		action: "current" | "upgrade" | "contact";
		disabled?: boolean;
	};
}

export const PLANS: Record<PlanTier, Plan> = {
	free: {
		id: "free",
		name: "Free",
		description: "Для тех, кто только начинает",
		price: null,
		limits: {
			maxUsers: 1,
			maxWorkspaces: 5,
			cloudWorkspaces: false,
			mobileApp: false,
		},
		features: [
			{ id: "users", name: "1 user", included: true },
			{ id: "workspaces", name: "До 5 воркспейсов", included: true },
			{ id: "local-only", name: "Только локальные воркспейсы", included: true },
			{ id: "desktop-app", name: "Desktop-приложение", included: true },
			{ id: "github", name: "Интеграция с GitHub", included: true },
		],
		cta: { text: "Текущий план", action: "current", disabled: true },
	},
	pro: {
		id: "pro",
		name: "Pro",
		description: "Для команд, которым нужно больше возможностей",
		price: { monthly: 2000, yearly: 18000 },
		limits: {
			maxUsers: null,
			maxWorkspaces: null,
			cloudWorkspaces: true,
			mobileApp: true,
		},
		features: [
			{
				id: "users",
				name: "Безлимитные пользователи",
				included: true,
				limit: "$20/seat",
			},
			{ id: "tasks", name: "Управление задачами", included: true },
			{ id: "cloud", name: "Облачные воркспейсы", included: true },
			{ id: "mobile", name: "Доступ к мобильному приложению", included: true },
			{ id: "priority", name: "Приоритетная поддержка", included: true },
			{ id: "roles", name: "Ролевые права доступа", included: true },
		],
		cta: { text: "Перейти на Pro", action: "upgrade" },
	},
	enterprise: {
		id: "enterprise",
		name: "Enterprise",
		description: "Для организаций с расширенными требованиями",
		price: null,
		limits: {
			maxUsers: null,
			maxWorkspaces: null,
			cloudWorkspaces: true,
			mobileApp: true,
		},
		features: [
			{ id: "everything-pro", name: "Все из Pro", included: true },
			{
				id: "sso",
				name: "SSO и расширенная безопасность",
				included: true,
			},
			{ id: "audit", name: "Аудит-логи", included: true },
			{
				id: "sla",
				name: "SLA и выделенная поддержка",
				included: true,
			},
			{ id: "custom", name: "Пользовательские интеграции", included: true },
		],
		cta: { text: "Связаться с продажами", action: "contact" },
	},
};

export interface BillingInfo {
	organizationId: string;
	currentPlan: PlanTier;
	seats: number;
	usage: {
		users: number;
		workspaces: number;
	};
	billing?: {
		stripeCustomerId: string;
		nextBillingDate: string;
		amount: number;
	};
}

export const MOCK_BILLING_INFO: BillingInfo = {
	organizationId: "mock-org",
	currentPlan: "free",
	seats: 1,
	usage: {
		users: 1,
		workspaces: 3,
	},
};
