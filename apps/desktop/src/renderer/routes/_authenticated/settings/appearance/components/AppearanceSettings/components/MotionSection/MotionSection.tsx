import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { type MotionPreference, useMotionPreference } from "renderer/monad";

const MOTION_OPTIONS: {
	value: MotionPreference;
	label: string;
	hint: string;
}[] = [
	{ value: "full", label: "Full", hint: "All animations" },
	{
		value: "essential",
		label: "Reduced",
		hint: "Essential state changes only",
	},
	{ value: "off", label: "Off", hint: "No animation" },
];

/**
 * The real, user-facing home for the MONAD motion preference (PR-13). Backed by
 * the persisted `useMotionPreference` store that every MONAD component consults
 * before animating — so this control already governs the shipped run-button
 * morph and every future binding. The OS `prefers-reduced-motion` is always
 * folded in on top of this choice.
 */
export function MotionSection() {
	const { preference, systemReduced, setPreference } = useMotionPreference();

	const activeLabel =
		MOTION_OPTIONS.find((option) => option.value === preference)?.label ??
		"Full";

	return (
		<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
			<div className="flex items-center justify-between gap-6 p-4">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">Motion</div>
					<div className="text-xs text-muted-foreground">
						Controls animations in the MONAD interface. "Reduced" keeps
						meaningful state changes but drops decorative motion; "Off" renders
						everything at rest.
						{systemReduced
							? " Your system's Reduce Motion setting is on, so decorative motion is already minimized."
							: " Your system's Reduce Motion setting is always respected."}
					</div>
				</div>
				<Select
					value={preference}
					onValueChange={(value) => setPreference(value as MotionPreference)}
				>
					<SelectTrigger size="sm" className="w-auto min-w-36 px-2">
						<SelectValue>
							<span className="text-xs">{activeLabel}</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{MOTION_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								<div className="flex flex-col">
									<span>{option.label}</span>
									<span className="text-xs text-muted-foreground">
										{option.hint}
									</span>
								</div>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
