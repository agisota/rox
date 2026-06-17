import { Network } from "lucide-react";
import { ViewCanvasPlaceholder } from "../ViewCanvasPlaceholder";

/**
 * Map view — radial mindmap of the conversation. Phase 0 renders the empty
 * canvas; the real graph reads `chat_messages.parent_message_id` to lay out
 * the root query, coverage rings, and frontier ghost-nodes.
 */
export function SessionMap() {
	return (
		<ViewCanvasPlaceholder
			icon={Network}
			title="Карта"
			description="Радиальная карта разговора: корневой запрос в центре, ветки решений с кольцами покрытия и ghost-ноды неисследованного фронтира."
			vocabulary={[
				"Корневой запрос",
				"Кольца покрытия",
				"Ghost-ноды фронтира",
				"merge / split веток",
			]}
		/>
	);
}
