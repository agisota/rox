import { Button } from "@rox/ui/button";
import { CircuitCanvas } from "@rox/ui/circuit";
import { Separator } from "@rox/ui/separator";
import { useExecutionCircuit } from "../../hooks/useExecutionCircuit";

interface ExecutionCircuitPanelProps {
	taskId: string;
}

/**
 * Task-detail section for the execution circuit: renders the circuit as a
 * State-First diagram ({@link CircuitCanvas}) above the typed transitions,
 * offers a "Generate draft" action when none exists, and a per-transition
 * "Copy prompt" button.
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
				<h2 className="text-lg font-semibold">Execution circuit</h2>
				{!circuit && !isLoading ? (
					<Button size="sm" onClick={generateDraft} disabled={isGenerating}>
						{isGenerating ? "Generating…" : "Generate draft"}
					</Button>
				) : null}
			</div>

			{isLoading && !circuit ? (
				<p className="text-sm text-muted-foreground">Loading circuit…</p>
			) : null}

			{!isLoading && !circuit ? (
				<p className="text-sm text-muted-foreground">
					No execution circuit yet. Generate a default draft to map this task to
					a TargetState and typed transitions.
				</p>
			) : null}

			{circuit ? (
				<div className="space-y-4">
					<CircuitCanvas spec={circuit.spec} className="w-full" />

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
										? "Copied"
										: "Copy prompt"}
								</Button>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</section>
	);
}
