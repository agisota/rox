import { Card } from "@rox/ui/card";
import { DrawnCheck, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/onboarding/finish/")({
	component: OnboardingFinishPage,
});

/**
 * Finish / summary step (F48, #637). The terminal wizard step: it confirms the
 * flow is complete and hands control to the footer's "Завершить" action, which
 * runs `user.completeOnboarding` and lands on /v2-workspaces (see layout.tsx).
 */
function OnboardingFinishPage() {
	const shouldAnimate = useShouldAnimate("decorative");
	return (
		<motion.div
			initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: motionDuration.base }}
		>
			<Card className="flex-row items-center gap-4 p-5">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
					<DrawnCheck className="size-4.5" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">Всё готово</p>
					<p className="text-xs text-muted-foreground">
						Нажмите «Завершить», чтобы перейти к рабочим пространствам.
						Остальные настройки доступны в любой момент.
					</p>
				</div>
			</Card>
		</motion.div>
	);
}
