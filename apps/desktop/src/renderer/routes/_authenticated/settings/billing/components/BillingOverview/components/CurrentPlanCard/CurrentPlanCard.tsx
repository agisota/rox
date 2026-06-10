import { Button } from "@rox/ui/button";
import { format } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { PLANS, type PlanTier } from "../../../../constants";

interface CurrentPlanCardProps {
	currentPlan: PlanTier;
	onCancel?: () => void;
	isCanceling?: boolean;
	onRestore?: () => void;
	isRestoring?: boolean;
	cancelAt?: Date | null;
	periodEnd?: Date | null;
}

const PLAN_DISPLAY: Record<PlanTier, { name: string; description: string }> = {
	free: {
		name: "Бесплатный",
		description: "Для тех, кто начинает работать самостоятельно",
	},
	pro: {
		name: "Pro",
		description: "Для команд, которым нужно больше возможностей",
	},
	enterprise: {
		name: "Enterprise",
		description: "Для организаций с расширенными потребностями",
	},
};

export function CurrentPlanCard({
	currentPlan,
	onCancel,
	isCanceling,
	onRestore,
	isRestoring,
	cancelAt,
	periodEnd,
}: CurrentPlanCardProps) {
	const plan = PLANS[currentPlan];
	const planDisplay = PLAN_DISPLAY[currentPlan];
	const isPaidPlan = currentPlan !== "free";
	const isEnterprise = currentPlan === "enterprise";
	const isCancelingAtPeriodEnd = isPaidPlan && !isEnterprise && !!cancelAt;

	const hint =
		isCancelingAtPeriodEnd && cancelAt
			? `Отменяется ${format(new Date(cancelAt), "d MMMM yyyy", { locale: ru })} — в конце расчетного периода тариф сменится на «Бесплатный».`
			: isEnterprise
				? "Управляется администратором вашей организации."
				: isPaidPlan && periodEnd
					? `Продлевается ${format(new Date(periodEnd), "d MMMM yyyy", { locale: ru })}.`
					: `${planDisplay.description}.`;

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">
						Тариф «{planDisplay.name}»
					</span>
					{isPaidPlan && (
						<span className="inline-flex items-center rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
							{plan.name}
						</span>
					)}
				</div>
				<div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
			</div>
			{isPaidPlan && !isEnterprise && (
				<div className="shrink-0">
					{isCancelingAtPeriodEnd ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={onRestore}
							disabled={isRestoring}
							className="text-primary"
						>
							{isRestoring ? "Восстановление..." : "Восстановить тариф"}
						</Button>
					) : (
						<Button
							variant="ghost"
							size="sm"
							onClick={onCancel}
							disabled={isCanceling}
							className="text-muted-foreground hover:text-destructive"
						>
							{isCanceling ? "Отмена..." : "Отменить тариф"}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
