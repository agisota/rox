import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Separator } from "@rox/ui/separator";
import { useExecutionCircuit } from "../../hooks/useExecutionCircuit";

interface ExecutionCircuitPanelProps {
	taskId: string;
}

/**
 * Minimal task-detail section for the execution circuit (foundation slice):
 * shows the TargetState + typed transitions read-only, offers a "Generate
 * draft" action when none exists, and a per-transition "Copy prompt" button.
 */
export function ExecutionCircuitPanel({ taskId }: ExecutionCircuitPanelProps) {
	const {
		circuit,
		isLoading,
		generateDraft,
		isGenerating,
		copyPrompt,
		copiedTransitionId,
	} = useExecutionCircuit(taskId);

	return (
		<section>
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-lg font-semibold">Схема исполнения</h2>
				{!circuit && !isLoading ? (
					<Button size="sm" onClick={generateDraft} disabled={isGenerating}>
						{isGenerating ? "Генерация…" : "Создать черновик"}
					</Button>
				) : null}
			</div>

			{isLoading && !circuit ? (
				<p className="text-sm text-muted-foreground">Загрузка схемы…</p>
			) : null}

			{!isLoading && !circuit ? (
				<p className="text-sm text-muted-foreground">
					Схемы исполнения пока нет. Создайте черновик по умолчанию, чтобы
					сопоставить эту задачу с целевым состоянием (TargetState) и
					типизированными переходами.
				</p>
			) : null}

			{circuit ? (
				<div className="space-y-4">
					<div className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">Целевое состояние:</span>
						<Badge variant="secondary">{circuit.spec.targetState}</Badge>
						<span className="text-muted-foreground">·</span>
						<span className="text-muted-foreground">Начальное:</span>
						<Badge variant="outline">{circuit.spec.initialState}</Badge>
					</div>

					<Separator />

					<ul className="space-y-3">
						{circuit.spec.transitions.map((transition) => (
							<li
								key={transition.id}
								className="flex items-start justify-between gap-4"
							>
								<div className="min-w-0">
									<div className="flex items-center gap-2 text-sm font-medium">
										<span>{transition.label ?? transition.id}</span>
										<span className="text-muted-foreground">
											{transition.from} → {transition.to}
										</span>
									</div>
									{transition.description ? (
										<p className="text-xs text-muted-foreground mt-0.5">
											{transition.description}
										</p>
									) : null}
								</div>
								<Button
									size="sm"
									variant="outline"
									onClick={() => copyPrompt(transition.id)}
								>
									{copiedTransitionId === transition.id
										? "Скопировано"
										: "Копировать промпт"}
								</Button>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</section>
	);
}
