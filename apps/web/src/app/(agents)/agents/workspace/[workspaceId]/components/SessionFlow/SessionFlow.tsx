import { Workflow } from "lucide-react";
import { ViewCanvasPlaceholder } from "../ViewCanvasPlaceholder";

/**
 * Flow view — directed acyclic graph of the session. Phase 0 renders the empty
 * canvas; the real DAG arranges messages into swimlanes (question → decision →
 * artifact) with status dots and a task-plan export node.
 */
export function SessionFlow() {
	return (
		<ViewCanvasPlaceholder
			icon={Workflow}
			title="Поток"
			description="Направленный граф сессии в плавательных дорожках: вопрос → решение → артефакт, со статусами узлов и экспортом плана задач."
			vocabulary={[
				"Swimlanes вопрос → решение → артефакт",
				"Статусы узлов",
				"Экспорт task_plan",
			]}
		/>
	);
}
