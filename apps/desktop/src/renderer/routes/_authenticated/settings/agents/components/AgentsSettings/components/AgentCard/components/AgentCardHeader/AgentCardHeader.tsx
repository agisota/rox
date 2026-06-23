import type { ResolvedAgentConfig } from "@rox/shared/agent-settings";
import { CardDescription, CardHeader, CardTitle } from "@rox/ui/card";
import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { Switch } from "@rox/ui/switch";
import { motion } from "framer-motion";
import { ChevronDownIcon } from "lucide-react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";

interface AgentCardHeaderProps {
	preset: ResolvedAgentConfig;
	isOpen: boolean;
	showEnabled: boolean;
	enabled: boolean;
	isUpdatingEnabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	onToggle: () => void;
}

export function AgentCardHeader({
	preset,
	isOpen,
	showEnabled,
	enabled,
	isUpdatingEnabled,
	onEnabledChange,
	onToggle,
}: AgentCardHeaderProps) {
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(preset.id, isDark);
	const contentId = `${preset.id}-settings`;
	const shouldAnimate = useShouldAnimate("essential");

	return (
		<CardHeader
			role="button"
			tabIndex={0}
			aria-expanded={isOpen}
			aria-controls={contentId}
			className="cursor-pointer gap-3 p-4 transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={onToggle}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onToggle();
				}
			}}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					{icon ? (
						<img src={icon} alt="" className="size-8 object-contain" />
					) : (
						<div className="size-8 rounded-lg bg-muted" />
					)}
					<div className="min-w-0">
						<CardTitle className="truncate">{preset.label}</CardTitle>
						<CardDescription className="mt-1">
							{preset.description ?? "Конфигурация запуска агента"}
						</CardDescription>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					{showEnabled && (
						<div className="flex items-center">
							<motion.div
								key={String(enabled)}
								initial={shouldAnimate ? { opacity: 0.8, scale: 0.97 } : false}
								animate={{ opacity: 1, scale: 1 }}
								transition={{
									duration: motionDuration.fast,
									ease: [...ease.standard],
								}}
							>
								<Switch
									id={`${preset.id}-enabled`}
									aria-label={`Включить ${preset.label}`}
									checked={enabled}
									disabled={isUpdatingEnabled}
									onCheckedChange={onEnabledChange}
									onClick={(event) => event.stopPropagation()}
									onKeyDown={(event) => event.stopPropagation()}
								/>
							</motion.div>
						</div>
					)}
					<motion.div
						animate={{ rotate: isOpen ? 180 : 0 }}
						transition={
							shouldAnimate
								? { duration: motionDuration.base, ease: [...ease.standard] }
								: { duration: 0 }
						}
					>
						<ChevronDownIcon
							aria-hidden="true"
							className="size-4 text-muted-foreground"
						/>
					</motion.div>
				</div>
			</div>
		</CardHeader>
	);
}
