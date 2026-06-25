import { Button } from "@rox/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import {
	type AnimationPreference,
	DEFAULT_ANIMATION_PREFERENCE,
	useSettings,
} from "renderer/stores/settings";

export function AnimationSection() {
	const animationPreference = useSettings((s) => s.animationPreference);
	const update = useSettings((s) => s.update);

	const isDefault = animationPreference === DEFAULT_ANIMATION_PREFERENCE;

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">Анимации</h3>
			<p className="text-xs text-muted-foreground mb-3">
				Управляет количеством движения в приложении. Настройка операционной
				системы «Уменьшение движения» всегда имеет приоритет.
			</p>
			<div className="flex items-center gap-2">
				<Select
					value={animationPreference}
					onValueChange={(value) =>
						update("animationPreference", value as AnimationPreference)
					}
				>
					<SelectTrigger className="w-[260px]" aria-label="Настройка анимации">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="full">Полная — вся анимация</SelectItem>
						<SelectItem value="essential">
							Необходимая — только функциональная анимация
						</SelectItem>
						<SelectItem value="off">Отключена — без анимации</SelectItem>
					</SelectContent>
				</Select>
				{!isDefault && (
					<Button
						variant="outline"
						size="sm"
						className="shrink-0"
						onClick={() =>
							update("animationPreference", DEFAULT_ANIMATION_PREFERENCE)
						}
					>
						Сбросить
					</Button>
				)}
			</div>
		</div>
	);
}
