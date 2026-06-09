import { Button } from "@rox/ui/button";
import { useState } from "react";
import {
	type CapsulePrerequisite,
	DeltaField,
	EventParticle,
	MonadCapsule,
	type MonadStatus,
	RuntimeFrame,
	StateNode,
	TargetAttractor,
	type TraceLine,
	TraceStream,
	TransitionEdge,
	ValidatorGate,
	type ValidatorState,
} from "renderer/monad";
import { GalleryCard } from "../GalleryCard";

const STATUSES: MonadStatus[] = [
	"resting",
	"transition",
	"verified",
	"warn",
	"error",
];

const VALIDATOR_STATES: ValidatorState[] = [
	"pending",
	"validating",
	"passed",
	"failed",
];

const PREREQUISITES: CapsulePrerequisite[] = [
	{ id: "branch", label: "branch: main", satisfied: true },
	{ id: "auth", label: "auth token", satisfied: true },
	{ id: "clean", label: "clean tree", satisfied: false },
];

const TRACE_LINES: TraceLine[] = [
	{ id: "1", text: "read package.json", tone: "muted" },
	{ id: "2", text: "resolve dependencies", tone: "default" },
	{ id: "3", text: "apply edit → V2WorkspaceRunButton.tsx", tone: "signal" },
	{ id: "4", text: "typecheck passed", tone: "verified" },
];

/** The nine MONAD primitives, each with a resting card and an active toggle. */
export function PrimitivesSection() {
	const [nodeActive, setNodeActive] = useState(false);
	const [edgeActive, setEdgeActive] = useState(false);
	const [particleActive, setParticleActive] = useState(false);
	const [frameRunning, setFrameRunning] = useState(false);
	const [attractorReached, setAttractorReached] = useState(false);
	const [validatorIndex, setValidatorIndex] = useState(0);

	const validatorState = VALIDATOR_STATES[validatorIndex] ?? "pending";

	return (
		<section className="mb-10">
			<h2
				className="mb-4 text-xs uppercase tracking-[0.18em]"
				style={{ color: "var(--monad-text-muted)" }}
			>
				Primitives
			</h2>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				<GalleryCard title="StateNode" hint="status × active">
					<div className="flex flex-wrap items-center gap-2">
						{STATUSES.map((status) => (
							<StateNode
								key={status}
								label={status}
								status={status}
								active={nodeActive}
							/>
						))}
					</div>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setNodeActive((v) => !v)}
					>
						{nodeActive ? "calm" : "activate"}
					</Button>
				</GalleryCard>

				<GalleryCard title="TransitionEdge" hint="S0 → S*">
					<TransitionEdge active={edgeActive} />
					<Button
						size="sm"
						variant="outline"
						onClick={() => setEdgeActive((v) => !v)}
					>
						{edgeActive ? "stop" : "run signal"}
					</Button>
				</GalleryCard>

				<GalleryCard title="EventParticle" hint="offset-path loop">
					<EventParticle active={particleActive} />
					<Button
						size="sm"
						variant="outline"
						onClick={() => setParticleActive((v) => !v)}
					>
						{particleActive ? "stop" : "emit"}
					</Button>
				</GalleryCard>

				<GalleryCard title="RuntimeFrame" hint="running scan">
					<RuntimeFrame label="runtime" running={frameRunning}>
						<div
							className="px-3 py-2 text-xs"
							style={{ color: "var(--monad-text-muted)" }}
						>
							pnpm dev · pid 42811
						</div>
					</RuntimeFrame>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setFrameRunning((v) => !v)}
					>
						{frameRunning ? "idle" : "run"}
					</Button>
				</GalleryCard>

				<GalleryCard title="MonadCapsule" hint="prerequisites">
					<MonadCapsule label="context" prerequisites={PREREQUISITES} />
				</GalleryCard>

				<GalleryCard title="TraceStream" hint="staggered trace">
					<TraceStream lines={TRACE_LINES} />
				</GalleryCard>

				<GalleryCard title="ValidatorGate" hint={validatorState}>
					<ValidatorGate state={validatorState} label={validatorState} />
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							setValidatorIndex((i) => (i + 1) % VALIDATOR_STATES.length)
						}
					>
						next state
					</Button>
				</GalleryCard>

				<GalleryCard
					title="TargetAttractor"
					hint={attractorReached ? "reached" : "seeking"}
				>
					<TargetAttractor reached={attractorReached} label="goal" />
					<Button
						size="sm"
						variant="outline"
						onClick={() => setAttractorReached((v) => !v)}
					>
						{attractorReached ? "reset" : "reach"}
					</Button>
				</GalleryCard>

				<GalleryCard title="DeltaField" hint="S0 → S* diff">
					<DeltaField from="S0" to="S*" additions={128} deletions={34} />
				</GalleryCard>
			</div>
		</section>
	);
}
