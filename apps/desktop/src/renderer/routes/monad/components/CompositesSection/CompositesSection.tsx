import { Button } from "@rox/ui/button";
import { useState } from "react";
import {
	type CapsulePrerequisite,
	DeltaField,
	MonadCapsule,
	RuntimeFrame,
	StateNode,
	TransitionEdge,
	ValidatorGate,
	type ValidatorState,
} from "renderer/monad";
import { GalleryCard } from "../GalleryCard";

const PREREQUISITES: CapsulePrerequisite[] = [
	{ id: "tool", label: "tool: edit_file", satisfied: true },
	{ id: "path", label: "path resolved", satisfied: true },
];

// A four-step agentic lifecycle the "advance" button walks through.
const STEPS = ["idle", "running", "validating", "done"] as const;

/**
 * Composites prove the primitives assemble into recognizable agentic scenes:
 * a tool-call lifecycle (context → execute → validate) and an S0→S* state
 * transition with its diff header.
 */
export function CompositesSection() {
	const [step, setStep] = useState(0);

	const running = step === 1;
	const validatorState: ValidatorState =
		step === 0 ? "pending" : step === 3 ? "passed" : "validating";
	const edgeActive = step >= 1 && step < 3;
	const targetVerified = step === 3;

	return (
		<section className="mb-10">
			<h2
				className="mb-4 text-xs uppercase tracking-[0.18em]"
				style={{ color: "var(--monad-text-muted)" }}
			>
				Composites
			</h2>
			<div className="grid gap-4 xl:grid-cols-2">
				<GalleryCard title="Tool-call lifecycle" hint={STEPS[step] ?? "idle"}>
					<div className="flex flex-wrap items-center gap-3">
						<MonadCapsule label="prerequisites" prerequisites={PREREQUISITES} />
						<RuntimeFrame label="execute" running={running}>
							<div
								className="px-3 py-2 text-xs"
								style={{ color: "var(--monad-text-muted)" }}
							>
								edit_file(V2WorkspaceRunButton.tsx)
							</div>
						</RuntimeFrame>
						<ValidatorGate state={validatorState} label={validatorState} />
					</div>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setStep((s) => (s + 1) % STEPS.length)}
					>
						advance → {STEPS[(step + 1) % STEPS.length]}
					</Button>
				</GalleryCard>

				<GalleryCard title="State transition" hint="S0 → S*">
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-3">
							<StateNode label="S0" status="resting" active={step === 0} />
							<TransitionEdge active={edgeActive} />
							<StateNode
								label="S*"
								status={targetVerified ? "verified" : "resting"}
								active={targetVerified}
							/>
						</div>
						<DeltaField from="S0" to="S*" additions={128} deletions={34} />
					</div>
				</GalleryCard>
			</div>
		</section>
	);
}
