"use client";

import type { LanguageModelUsage } from "ai";
import { useShouldAnimate } from "../../motion";
import {
	Context,
	ContextCacheUsage,
	ContextContent,
	ContextContentBody,
	ContextContentFooter,
	ContextContentHeader,
	ContextInputUsage,
	ContextOutputUsage,
	ContextReasoningUsage,
	ContextTrigger,
} from "./context";

export type ComposerContextRingProps = {
	/** Estimated tokens currently occupying the context window. */
	usedTokens: number;
	/** The selected model's context window in tokens. */
	maxTokens: number;
	/** Optional per-type usage breakdown (input/output/reasoning/cache). */
	usage?: LanguageModelUsage;
	/** Model id used for cost estimation in the breakdown footer. */
	modelId?: string;
	/** Extra classes for the trigger button. */
	className?: string;
};

/**
 * Composer context-usage ring (Hermes-borrow F42).
 *
 * The single cross-platform render of the dead `Context` donut primitive: a
 * percentage + donut trigger that opens a token-usage breakdown on hover. All
 * web/desktop composers mount this one component so the surface differs only in
 * where it sits, not in how it renders. Token inputs come from the shared
 * `@rox/shared/context-usage` selector. The donut fill is gated on
 * `useShouldAnimate` for reduced-motion compliance.
 */
export function ComposerContextRing({
	usedTokens,
	maxTokens,
	usage,
	modelId,
	className,
}: ComposerContextRingProps) {
	const shouldAnimate = useShouldAnimate();

	return (
		<Context
			animated={shouldAnimate}
			maxTokens={maxTokens}
			modelId={modelId}
			usage={usage}
			usedTokens={usedTokens}
		>
			<ContextTrigger
				aria-label="Использование контекста модели"
				className={className}
			/>
			<ContextContent>
				<ContextContentHeader />
				<ContextContentBody>
					<div className="space-y-1">
						<ContextInputUsage />
						<ContextOutputUsage />
						<ContextReasoningUsage />
						<ContextCacheUsage />
					</div>
				</ContextContentBody>
				<ContextContentFooter />
			</ContextContent>
		</Context>
	);
}
