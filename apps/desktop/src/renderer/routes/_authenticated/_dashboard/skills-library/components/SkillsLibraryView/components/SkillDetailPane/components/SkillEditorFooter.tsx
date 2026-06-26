/**
 * Sticky editor footer: dirty indicator (motion pop) + Save button.
 *
 * Autosave handles persistence on its own; this gives an explicit save plus a
 * clear "● Не сохранено" / "Сохранено" status so the state is never ambiguous.
 */

import { Button } from "@rox/ui/button";
import {
	AnimatedPresence,
	motionSpring,
	useShouldAnimate,
} from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { motion } from "motion/react";
import { LuCheck, LuSave } from "react-icons/lu";

interface SkillEditorFooterProps {
	isDirty: boolean;
	isSaving: boolean;
	onSave: () => void;
}

export function SkillEditorFooter({
	isDirty,
	isSaving,
	onSave,
}: SkillEditorFooterProps) {
	const shouldAnimate = useShouldAnimate("essential");

	return (
		<div className="flex items-center justify-between gap-2 border-t border-border bg-card/40 px-4 py-2">
			<AnimatedPresence mode="wait" initial={false}>
				{isDirty ? (
					<motion.span
						key="dirty"
						className="flex items-center gap-1.5 text-xs text-amber-400"
						initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : false}
						animate={{ opacity: 1, scale: 1 }}
						exit={shouldAnimate ? { opacity: 0, scale: 0.9 } : undefined}
						transition={motionSpring.pop}
					>
						<span
							className={cn(
								"size-1.5 rounded-full bg-amber-400",
								isSaving && "animate-pulse",
							)}
						/>
						{isSaving ? "Сохранение…" : "Не сохранено"}
					</motion.span>
				) : (
					<motion.span
						key="saved"
						className="flex items-center gap-1.5 text-xs text-muted-foreground"
						initial={shouldAnimate ? { opacity: 0 } : false}
						animate={{ opacity: 1 }}
						exit={shouldAnimate ? { opacity: 0 } : undefined}
						transition={{ duration: 0.12 }}
					>
						<LuCheck className="size-3.5" />
						Сохранено
					</motion.span>
				)}
			</AnimatedPresence>
			<Button
				size="sm"
				variant="secondary"
				disabled={!isDirty || isSaving}
				onClick={onSave}
			>
				<LuSave className="size-4" />
				Сохранить
			</Button>
		</div>
	);
}
