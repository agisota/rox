/**
 * Frontmatter form for SKILL.md — edits `name` / `description` as fields that
 * two-way sync with the YAML block in the editor draft.
 *
 * Reading: parse the live draft → field values. Writing: serialize the edited
 * field back into the draft text (preserving body + unknown keys), which
 * re-renders CodeMirror and feeds the same 800ms autosave. This removes the
 * "frontmatter can only be hand-edited in the text" pain from the old screen.
 */

import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Textarea } from "@rox/ui/textarea";
import { useMemo } from "react";
import { LuFileText } from "react-icons/lu";
import {
	applyFrontmatterEdit,
	parseSkillDocument,
} from "../../../../../lib/frontmatter";

interface SkillFrontmatterFormProps {
	/** Current SKILL.md draft text (source of truth). */
	value: string;
	/** Emit the new full document text when a field changes. */
	onChange: (nextDocument: string) => void;
}

export function SkillFrontmatterForm({
	value,
	onChange,
}: SkillFrontmatterFormProps) {
	const frontmatter = useMemo(
		() => parseSkillDocument(value).frontmatter,
		[value],
	);

	const update = (field: "name" | "description", fieldValue: string) => {
		onChange(
			applyFrontmatterEdit(value, { ...frontmatter, [field]: fieldValue }),
		);
	};

	return (
		<div className="flex flex-col gap-3 border-b border-border bg-card/40 px-4 py-3">
			<div className="flex items-center gap-2 text-muted-foreground">
				<LuFileText className="size-3.5" />
				<span className="text-xs font-medium uppercase tracking-wide">
					Frontmatter
				</span>
			</div>
			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
				<div className="flex flex-col gap-1.5">
					<Label
						htmlFor="skill-frontmatter-name"
						className="text-xs text-muted-foreground"
					>
						Имя (name)
					</Label>
					<Input
						id="skill-frontmatter-name"
						value={frontmatter.name}
						onChange={(event) => update("name", event.target.value)}
						placeholder="my-skill"
						className="h-8 font-mono text-xs"
						spellCheck={false}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label
						htmlFor="skill-frontmatter-description"
						className="text-xs text-muted-foreground"
					>
						Описание (description)
					</Label>
					<Textarea
						id="skill-frontmatter-description"
						value={frontmatter.description}
						onChange={(event) => update("description", event.target.value)}
						placeholder="Когда и зачем использовать этот скилл…"
						className="min-h-[2.25rem] resize-y text-xs leading-relaxed"
						rows={2}
						spellCheck={false}
					/>
				</div>
			</div>
		</div>
	);
}
