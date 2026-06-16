import { WORKSPACE_SETUP_PRESETS } from "@rox/shared/workspace-setup-presets";
import {
	applyStarterToSelection,
	isStarterSelected,
	removeStarterFromSelection,
	WORKSPACE_STARTER_PRESETS,
} from "@rox/shared/workspace-starter-presets";
import { Checkbox } from "@rox/ui/checkbox";

interface WorkspaceSetupPresetsProps {
	/** Currently selected preset ids. */
	selectedIds: string[];
	/** Called with the next selection when a preset is toggled. */
	onChange: (selectedIds: string[]) => void;
	className?: string;
}

/**
 * Multi-select list of workspace setup presets (git init, AGENTS.md, deep-wiki,
 * scaffold folders, CI/CD, todo/spec/planner templates, …). Controlled: the
 * caller owns the selected ids and threads them into the `.rox/config.json`
 * `setup` array via `resolveWorkspaceSetupPresets`.
 *
 * A "Стартеры" section sits above the individual options: each starter is a
 * curated bundle of single-effect presets. Toggling a starter selects (or
 * clears) every preset id it bundles, and the individual checkboxes below stay
 * in sync. All selection math lives in `@rox/shared/workspace-starter-presets`
 * so this component is a thin, presentational wrapper.
 */
export function WorkspaceSetupPresets({
	selectedIds,
	onChange,
	className,
}: WorkspaceSetupPresetsProps) {
	const selected = new Set(selectedIds);

	function toggle(id: string, checked: boolean) {
		const next = new Set(selected);
		if (checked) next.add(id);
		else next.delete(id);
		onChange(
			WORKSPACE_SETUP_PRESETS.map((p) => p.id).filter((p) => next.has(p)),
		);
	}

	function toggleStarter(starterId: string, active: boolean) {
		onChange(
			active
				? removeStarterFromSelection(selectedIds, starterId)
				: applyStarterToSelection(selectedIds, starterId),
		);
	}

	return (
		<div className={className}>
			<div className="flex flex-col gap-3">
				<section className="flex flex-col gap-1.5">
					<div className="flex flex-col gap-0.5">
						<span className="text-sm font-medium leading-none">Стартеры</span>
						<span className="text-xs text-muted-foreground">
							Готовые наборы — один клик отмечает все входящие опции ниже.
						</span>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{WORKSPACE_STARTER_PRESETS.map((starter) => {
							const active = isStarterSelected(selectedIds, starter.id);
							return (
								<button
									key={starter.id}
									type="button"
									aria-pressed={active}
									title={starter.description}
									onClick={() => toggleStarter(starter.id, active)}
									className={`rounded-full border px-3 py-1 text-xs transition-colors ${
										active
											? "border-primary bg-primary/10 text-primary"
											: "border-border text-foreground hover:bg-accent/40"
									}`}
								>
									{starter.label}
								</button>
							);
						})}
					</div>
				</section>
				<ul className="flex flex-col gap-1">
					{WORKSPACE_SETUP_PRESETS.map((preset) => {
						const isChecked = selected.has(preset.id);
						const labelId = `workspace-preset-${preset.id}`;
						return (
							<li key={preset.id}>
								<label
									htmlFor={labelId}
									className="flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-accent/40"
								>
									<Checkbox
										id={labelId}
										checked={isChecked}
										onCheckedChange={(value) =>
											toggle(preset.id, value === true)
										}
										className="mt-0.5"
									/>
									<span className="flex flex-col gap-0.5">
										<span className="text-sm font-medium leading-none">
											{preset.label}
										</span>
										<span className="text-xs text-muted-foreground">
											{preset.description}
										</span>
									</span>
								</label>
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}
