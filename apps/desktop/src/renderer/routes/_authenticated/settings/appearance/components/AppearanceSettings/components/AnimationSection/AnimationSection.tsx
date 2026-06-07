import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { type AnimationPreference, useSettings } from "renderer/stores/settings";

export function AnimationSection() {
	const animationPreference = useSettings((s) => s.animationPreference);
	const update = useSettings((s) => s.update);

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">Animations</h3>
			<p className="text-xs text-muted-foreground mb-3">
				Control how much motion the app uses. Your operating system's "Reduce
				motion" setting always overrides this.
			</p>
			<Select
				value={animationPreference}
				onValueChange={(value) =>
					update("animationPreference", value as AnimationPreference)
				}
			>
				<SelectTrigger className="w-[260px]" aria-label="Animation preference">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="full">Full — all motion</SelectItem>
					<SelectItem value="essential">
						Essential — only functional motion
					</SelectItem>
					<SelectItem value="off">Off — no animations</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
