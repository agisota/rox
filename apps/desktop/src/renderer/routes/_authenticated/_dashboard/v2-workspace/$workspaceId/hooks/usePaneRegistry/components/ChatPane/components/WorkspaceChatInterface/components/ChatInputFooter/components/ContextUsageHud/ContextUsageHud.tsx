import { resolveChatTokenBudget } from "@rox/shared/chat-token-budget";
import {
	Context,
	ContextContent,
	ContextContentHeader,
	ContextTrigger,
} from "@rox/ui/ai-elements/context";
import { useShouldAnimate } from "@rox/ui/motion";
import { Progress } from "@rox/ui/progress";
import { PILL_BUTTON_CLASS } from "renderer/components/Chat/ChatInterface/styles";

/** Whole-percent scale for the progress gauge. */
const PERCENT_MAX = 100;
/** RU number formatter for the compact "использовано N / окно" readout. */
const COMPACT_RU = new Intl.NumberFormat("ru-RU", { notation: "compact" });
const PERCENT_RU = new Intl.NumberFormat("ru-RU", {
	style: "percent",
	maximumFractionDigits: 1,
});

interface ContextUsageHudProps {
	/** Estimated tokens consumed by the current thread. */
	usedTokens: number;
	/** Selected model's context-window size in tokens (0 = unknown). */
	maxTokens: number;
}

/**
 * Token-budget HUD for the composer footer. Renders the vendored ai-elements
 * `Context` primitive with a RU label and Victor Mono (`font-mono`) numerics,
 * showing "использовано N / окно модели" so the user sees how full the selected
 * model's context window is as the thread grows. Hidden until a model window is
 * known so we never render a misleading empty gauge.
 */
export function ContextUsageHud({
	usedTokens,
	maxTokens,
}: ContextUsageHudProps) {
	const animate = useShouldAnimate("decorative");
	const budget = resolveChatTokenBudget({ usedTokens, maxTokens });

	if (budget.maxTokens <= 0) return null;

	const used = COMPACT_RU.format(budget.usedTokens);
	const total = COMPACT_RU.format(budget.maxTokens);
	const percent = PERCENT_RU.format(budget.usedFraction);

	return (
		<Context
			maxTokens={budget.maxTokens}
			usedTokens={budget.usedTokens}
			// OS/preference reduce-motion: render the hover card without
			// open/close delay animation when motion is disabled.
			closeDelay={animate ? undefined : 0}
			openDelay={animate ? undefined : 0}
		>
			<ContextTrigger
				className={PILL_BUTTON_CLASS}
				aria-label={`Контекст: использовано ${used} из ${total} токенов`}
			>
				<span className="font-mono text-muted-foreground tabular-nums">
					{used} / {total}
				</span>
			</ContextTrigger>
			<ContextContent>
				<ContextContentHeader className="space-y-2 p-3">
					<div className="flex items-center justify-between gap-3 text-xs">
						<p className="text-muted-foreground">Контекст модели</p>
						<p className="font-mono tabular-nums">{percent}</p>
					</div>
					<div className="flex items-center justify-between gap-3 text-xs">
						<p className="text-muted-foreground">Использовано / окно</p>
						<p className="font-mono tabular-nums">
							{used} / {total}
						</p>
					</div>
					<Progress
						className={
							animate
								? "bg-muted"
								: "bg-muted [&>[data-slot=progress-indicator]]:transition-none"
						}
						value={budget.usedFraction * PERCENT_MAX}
					/>
				</ContextContentHeader>
			</ContextContent>
		</Context>
	);
}
