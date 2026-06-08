import { WORKSPACE_SETUP_PRESETS } from "@rox/shared/workspace-setup-presets";
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

	return (
		<div className={className}>
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
									onCheckedChange={(value) => toggle(preset.id, value === true)}
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
	);
}
