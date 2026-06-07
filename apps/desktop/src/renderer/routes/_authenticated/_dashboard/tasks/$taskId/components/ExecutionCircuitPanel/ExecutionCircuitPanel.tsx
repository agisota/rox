import {
	computeMonadCompleteness,
	type ExecutionCircuitSpec,
} from "@superset/shared/execution-circuit";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Separator } from "@superset/ui/separator";
import { useEffect, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getExecutionCircuitGraphPlan,
	getLatestRunsByTransition,
} from "./ExecutionCircuitPanel.state";

type ExecutionCircuitPanelProps = {
	taskId: string;
};

function formatSpec(spec: ExecutionCircuitSpec): string {
	return JSON.stringify(spec, null, 2);
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: "Execution Circuit request failed.";
}

export function ExecutionCircuitPanel({ taskId }: ExecutionCircuitPanelProps) {
	const utils = electronTrpc.useUtils();
	const circuitQuery = electronTrpc.executionCircuit.getByTaskId.useQuery({
		taskId,
	});
	const createDraft =
		electronTrpc.executionCircuit.createDraftForTask.useMutation({
			onSuccess: (circuit) => {
				const formatted = formatSpec(circuit.specJson);
				setSpecText(formatted);
				setSourceCircuitId(circuit.id);
				setIsDirty(false);
				setStatusMessage("Execution Circuit created.");
				setErrorMessage(null);
				utils.executionCircuit.getByTaskId.invalidate({ taskId });
			},
			onError: (error) => {
				setErrorMessage(getErrorMessage(error));
			},
		});
	const upsertSpec = electronTrpc.executionCircuit.upsertSpec.useMutation({
		onSuccess: (circuit) => {
			const formatted = formatSpec(circuit.specJson);
			setSpecText(formatted);
			setSourceCircuitId(circuit.id);
			setIsDirty(false);
			setStatusMessage("Saved.");
			setErrorMessage(null);
			utils.executionCircuit.getByTaskId.invalidate({ taskId });
		},
		onError: (error) => {
			setErrorMessage(getErrorMessage(error));
		},
	});
	const createTransitionRun =
		electronTrpc.executionCircuit.createTransitionRun.useMutation({
			onSuccess: () => {
				setStatusMessage("Transition run created.");
				setErrorMessage(null);
				utils.executionCircuit.getByTaskId.invalidate({ taskId });
			},
			onError: (error) => {
				setErrorMessage(getErrorMessage(error));
			},
		});
	const createNextTransitionRun =
		electronTrpc.executionCircuit.createNextTransitionRun.useMutation({
			onSuccess: (run) => {
				setStatusMessage(`Next transition run created: ${run.transitionId}.`);
				setErrorMessage(null);
				utils.executionCircuit.getByTaskId.invalidate({ taskId });
			},
			onError: (error) => {
				setErrorMessage(getErrorMessage(error));
			},
		});
	const runValidators =
		electronTrpc.executionCircuit.runValidatorsForTransitionRun.useMutation({
			onSuccess: (summary) => {
				setStatusMessage(summary.details);
				setErrorMessage(null);
				utils.executionCircuit.getByTaskId.invalidate({ taskId });
			},
			onError: (error) => {
				setErrorMessage(getErrorMessage(error));
			},
		});
	const importSpecForTask =
		electronTrpc.executionCircuit.importSpecForTask.useMutation({
			onSuccess: (importedCircuit) => {
				setSpecText(formatSpec(importedCircuit.specJson));
				setSourceCircuitId(importedCircuit.id);
				setIsDirty(false);
				setStatusMessage("Execution Circuit imported.");
				setErrorMessage(null);
				utils.executionCircuit.getByTaskId.invalidate({ taskId });
			},
			onError: (error) => {
				setErrorMessage(getErrorMessage(error));
			},
		});

	const circuit = circuitQuery.data;
	const [specText, setSpecText] = useState("");
	const [transferText, setTransferText] = useState("");
	const [sourceCircuitId, setSourceCircuitId] = useState<string | null>(null);
	const [isDirty, setIsDirty] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [promptPreview, setPromptPreview] = useState<string | null>(null);

	useEffect(() => {
		if (circuit && (!isDirty || sourceCircuitId !== circuit.id)) {
			setSpecText(formatSpec(circuit.specJson));
			setSourceCircuitId(circuit.id);
			setIsDirty(false);
		}
	}, [circuit, isDirty, sourceCircuitId]);

	const latestRunsByTransition = useMemo(
		() => getLatestRunsByTransition(circuit?.transitionRuns ?? []),
		[circuit],
	);
	const graphPlan = useMemo(
		() => (circuit ? getExecutionCircuitGraphPlan(circuit) : null),
		[circuit],
	);
	const graphNodesByTransition = useMemo(() => {
		const map = new Map<
			string,
			NonNullable<typeof graphPlan>["nodes"][number]
		>();
		for (const node of graphPlan?.nodes ?? []) {
			map.set(node.transitionId, node);
		}
		return map;
	}, [graphPlan]);

	const validationErrors = circuit?.validationJson.errors ?? [];

	const handleCreate = () => {
		createDraft.mutate({ taskId });
	};

	const handleSave = async () => {
		setErrorMessage(null);
		setStatusMessage(null);

		let parsed: unknown;
		try {
			parsed = JSON.parse(specText) as unknown;
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Invalid JSON document.",
			);
			return;
		}

		try {
			const validation = await utils.executionCircuit.validateSpec.fetch({
				spec: parsed,
			});
			if (!validation.ok) {
				setErrorMessage(
					validation.errors
						.map((item) => `${item.path}: ${item.message}`)
						.join("\n"),
				);
				return;
			}

			await upsertSpec.mutateAsync({ taskId, spec: parsed });
		} catch (error) {
			setErrorMessage(getErrorMessage(error));
		}
	};

	const handleCopyPrompt = async (transitionId: string) => {
		if (!circuit) return;

		setErrorMessage(null);
		setStatusMessage(null);

		try {
			const prompt = await utils.executionCircuit.compileTransitionPrompt.fetch(
				{
					circuitId: circuit.id,
					transitionId,
				},
			);

			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(prompt);
				setPromptPreview("Prompt copied to clipboard.");
				return;
			}

			setPromptPreview(prompt);
		} catch (error) {
			setErrorMessage(getErrorMessage(error));
		}
	};

	const handleCreateRun = (transitionId: string) => {
		if (!circuit) return;
		createTransitionRun.mutate({
			circuitId: circuit.id,
			transitionId,
		});
	};

	const handleCreateNextRun = () => {
		if (!circuit) return;
		createNextTransitionRun.mutate({
			circuitId: circuit.id,
		});
	};

	const handleRunValidators = (transitionRunId: string) => {
		runValidators.mutate({ transitionRunId });
	};

	const handleExportSpec = async () => {
		if (!circuit) return;

		setErrorMessage(null);
		setStatusMessage(null);

		try {
			const exported = await utils.executionCircuit.exportSpec.fetch({
				circuitId: circuit.id,
			});
			setTransferText(exported);

			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(exported);
				setStatusMessage("Execution Circuit JSON exported and copied.");
			} else {
				setStatusMessage("Execution Circuit JSON exported.");
			}
		} catch (error) {
			setErrorMessage(getErrorMessage(error));
		}
	};

	const handleImportSpec = async () => {
		setErrorMessage(null);
		setStatusMessage(null);

		if (!transferText.trim()) {
			setErrorMessage(
				"Paste exported Execution Circuit JSON before importing.",
			);
			return;
		}

		try {
			await importSpecForTask.mutateAsync({
				taskId,
				serializedSpec: transferText,
			});
		} catch (error) {
			setErrorMessage(getErrorMessage(error));
		}
	};

	return (
		<section className="mt-8 rounded-lg border bg-card/40">
			<div className="flex items-start justify-between gap-4 p-4">
				<div>
					<h2 className="text-lg font-semibold">Execution Circuit</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						State contract, transition prompts, traces, and validators for this
						task.
					</p>
				</div>
				{circuit ? (
					<div className="flex flex-wrap items-center justify-end gap-2">
						{graphPlan ? (
							<Badge variant="outline">
								Next: {graphPlan.nextTransitionId ?? "none"}
							</Badge>
						) : null}
						<Badge
							variant={circuit.status === "draft" ? "secondary" : "default"}
						>
							{circuit.status}
						</Badge>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={
								!graphPlan?.nextTransitionId ||
								createNextTransitionRun.isPending
							}
							onClick={handleCreateNextRun}
						>
							Start next transition
						</Button>
					</div>
				) : null}
			</div>

			<Separator />

			{circuitQuery.isLoading ? (
				<div className="p-4 text-sm text-muted-foreground">
					Loading execution circuit...
				</div>
			) : circuit ? (
				<div className="space-y-5 p-4">
					<div className="grid gap-3 md:grid-cols-2">
						<StateCard
							label="Current state"
							title={circuit.specJson.currentState.name}
							description={circuit.specJson.currentState.description}
							assertions={circuit.specJson.currentState.assertions}
						/>
						<StateCard
							label="Target state"
							title={circuit.specJson.targetState.name}
							description={circuit.specJson.targetState.description}
							assertions={circuit.specJson.targetState.assertions}
						/>
					</div>

					<div>
						<h3 className="mb-2 text-sm font-medium">Transitions</h3>
						<div className="space-y-3">
							{circuit.specJson.transitions.map((transition) => {
								const completeness = computeMonadCompleteness(transition);
								const latestRun = latestRunsByTransition.get(transition.id);
								const graphNode = graphNodesByTransition.get(transition.id);

								return (
									<div
										key={transition.id}
										className="rounded-md border bg-background/60 p-3"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<div className="font-medium">{transition.name}</div>
												<div className="mt-1 text-xs text-muted-foreground">
													{transition.fromStateId} {"->"} {transition.toStateId}
												</div>
											</div>
											<div className="flex items-center gap-2">
												{graphNode ? (
													<Badge variant="outline">{graphNode.status}</Badge>
												) : null}
												<Badge variant="outline">
													{completeness.score}% ready
												</Badge>
												{latestRun ? (
													<Badge variant="secondary">{latestRun.status}</Badge>
												) : null}
												<Button
													type="button"
													size="sm"
													variant="outline"
													disabled={createTransitionRun.isPending}
													onClick={() => handleCreateRun(transition.id)}
												>
													Start run
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													disabled={!latestRun || runValidators.isPending}
													onClick={() => {
														if (latestRun) handleRunValidators(latestRun.id);
													}}
												>
													Run validators
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() => handleCopyPrompt(transition.id)}
												>
													Copy agent prompt
												</Button>
											</div>
										</div>

										{completeness.missing.length > 0 ? (
											<div className="mt-2 text-xs text-muted-foreground">
												Missing: {completeness.missing.join(", ")}
											</div>
										) : null}

										<div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
											<div>
												<div className="font-medium">Validators</div>
												<ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
													{transition.validators.map((validator, index) => (
														<li key={`${transition.id}-validator-${index}`}>
															{validator.kind}: {validator.description}
														</li>
													))}
												</ul>
											</div>
											<div>
												<div className="font-medium">Trace events</div>
												{latestRun?.traceEvents.length ? (
													<ol className="mt-1 list-decimal space-y-1 pl-4 text-muted-foreground">
														{latestRun.traceEvents.map((event) => (
															<li key={event.id}>
																{event.type}: {event.message}
															</li>
														))}
													</ol>
												) : (
													<div className="mt-1 text-muted-foreground">
														No trace events yet.
													</div>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>

					<div>
						<div className="mb-2 flex items-center justify-between gap-3">
							<h3 className="text-sm font-medium">Spec JSON</h3>
							<div className="flex items-center gap-2">
								{isDirty ? (
									<Badge variant="secondary">Unsaved changes</Badge>
								) : null}
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={handleExportSpec}
								>
									Export JSON
								</Button>
								<Button
									type="button"
									size="sm"
									onClick={handleSave}
									disabled={upsertSpec.isPending}
								>
									Save spec
								</Button>
							</div>
						</div>
						<textarea
							className="min-h-64 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
							spellCheck={false}
							value={specText}
							onChange={(event) => {
								setSpecText(event.target.value);
								setIsDirty(true);
								setErrorMessage(null);
								setStatusMessage(null);
							}}
						/>
					</div>

					<div>
						<div className="mb-2 flex items-center justify-between gap-3">
							<h3 className="text-sm font-medium">Workflow import/export</h3>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={handleImportSpec}
								disabled={importSpecForTask.isPending}
							>
								Import JSON
							</Button>
						</div>
						<textarea
							className="min-h-28 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
							spellCheck={false}
							placeholder="Exported Execution Circuit JSON for import or handoff..."
							value={transferText}
							onChange={(event) => {
								setTransferText(event.target.value);
								setErrorMessage(null);
								setStatusMessage(null);
							}}
						/>
					</div>

					{statusMessage ? (
						<div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
							{statusMessage}
						</div>
					) : null}

					{validationErrors.length > 0 || errorMessage ? (
						<pre className="select-text cursor-text whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
							{errorMessage ??
								validationErrors
									.map((item) => `${item.path}: ${item.message}`)
									.join("\n")}
						</pre>
					) : null}

					{promptPreview ? (
						<textarea
							className="min-h-32 w-full resize-y rounded-md border bg-muted p-3 font-mono text-xs select-text cursor-text"
							readOnly
							value={promptPreview}
						/>
					) : null}
				</div>
			) : (
				<div className="flex items-center justify-between gap-4 p-4">
					<p className="text-sm text-muted-foreground">
						This task does not have a state-transition contract yet.
					</p>
					<Button
						type="button"
						onClick={handleCreate}
						disabled={createDraft.isPending}
					>
						Create Execution Circuit
					</Button>
				</div>
			)}
		</section>
	);
}

function StateCard({
	label,
	title,
	description,
	assertions,
}: {
	label: string;
	title: string;
	description: string;
	assertions: string[];
}) {
	return (
		<div className="rounded-md border bg-background/60 p-3">
			<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 font-medium">{title}</div>
			<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			<ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
				{assertions.map((assertion) => (
					<li key={`${title}-assertion-${assertion}`}>{assertion}</li>
				))}
			</ul>
		</div>
	);
}
