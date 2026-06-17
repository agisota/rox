import { Map as MapIcon } from "lucide-react";
import { ViewCanvasPlaceholder } from "../ViewCanvasPlaceholder";

/**
 * Atlas view — territory map of knowledge coverage. Phase 0 renders the empty
 * canvas; the real atlas plots explored domains as lit territories, a
 * deeper/wider frontier, and a coverage scorecard.
 */
export function SessionAtlas() {
	return (
		<ViewCanvasPlaceholder
			icon={MapIcon}
			title="Атлас"
			description="Карта территорий покрытия знаний: освещённые домены, фронтир глубже / шире и скоркард покрытия по осям."
			vocabulary={[
				"Territory-карта доменов",
				"Фронтир deeper / wider",
				"Coverage scorecard",
			]}
		/>
	);
}
