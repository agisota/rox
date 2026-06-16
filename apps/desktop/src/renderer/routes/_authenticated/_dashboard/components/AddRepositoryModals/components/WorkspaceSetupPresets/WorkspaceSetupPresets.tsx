import { WORKSPACE_STARTER_PRESETS } from "@rox/shared/workspace-starter-presets";
import { Checkbox } from "@rox/ui/checkbox";

interface WorkspaceSetupPresetsProps {
	/** Currently selected preset ids. */
	selectedIds: string[];
	/** Called with the next selection when a preset is toggled. */
	onChange: (selectedIds: string[]) => void;
	className?: string;
}

/**
 * Multi-select list of workspace starter presets. Controlled: the caller owns
 * selected ids and sends them to project creation, where the host service
 * resolves each starter into scaffold files and setup commands.
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
			WORKSPACE_STARTER_PRESETS.map((p) => p.id).filter((p) => next.has(p)),
		);
	}

	return (
		<div className={className}>
			<ul className="flex flex-col gap-1">
				{WORKSPACE_STARTER_PRESETS.map((preset) => {
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
