"use client";

import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";

import {
	effectiveLabel,
	type FlagOverrideState,
	nextFlagState,
	overrideToState,
	stateToOverride,
} from "../../../../utils/flagState";

interface FlagToggleRowProps {
	flagKey: string;
	description: string;
	override: boolean | null;
	effective: boolean;
	disabled?: boolean;
	onChange: (value: boolean | null) => void;
}

const STATE_LABEL: Record<FlagOverrideState, string> = {
	on: "Force ON",
	off: "Force OFF",
	inherit: "Inherit (PostHog)",
};

const STATE_VARIANT: Record<
	FlagOverrideState,
	"default" | "destructive" | "outline"
> = {
	on: "default",
	off: "destructive",
	inherit: "outline",
};

export function FlagToggleRow({
	flagKey,
	description,
	override,
	effective,
	disabled,
	onChange,
}: FlagToggleRowProps) {
	const state = overrideToState(override);

	const handleClick = () => {
		const next = nextFlagState(state);
		onChange(stateToOverride(next));
	};

	return (
		<div className="flex items-center justify-between gap-4 py-3">
			<div className="min-w-0">
				<p className="font-mono text-sm font-medium">{flagKey}</p>
				<p className="text-muted-foreground truncate text-xs">{description}</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Badge variant={effective ? "secondary" : "outline"}>
					{effectiveLabel(effective)}
				</Badge>
				<Button
					size="sm"
					variant="outline"
					onClick={handleClick}
					disabled={disabled}
				>
					<Badge variant={STATE_VARIANT[state]} className="mr-1">
						●
					</Badge>
					{STATE_LABEL[state]}
				</Button>
			</div>
		</div>
	);
}
