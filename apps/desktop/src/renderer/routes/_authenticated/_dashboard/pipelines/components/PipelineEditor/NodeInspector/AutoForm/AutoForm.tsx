import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { Switch } from "@rox/ui/switch";
import { Textarea } from "@rox/ui/textarea";
import type { NodeFieldDef, NodeTypeDefinition } from "@rox/workflow-core";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import type { PipelineFlowNode } from "../../graph-adapter";
import {
	commitNumberField,
	commitSelectField,
	commitTextField,
	SELECT_NONE,
} from "../fieldCommit";
import type { NodePatchApi } from "../useNodePatch";
import { groupFieldSections, shouldShowSectionHeadings } from "./fieldSections";

type AutoFormProps = {
	def: NodeTypeDefinition;
	node: PipelineFlowNode;
	patch: NodePatchApi;
};

/**
 * Registry-driven inspector body: renders one control per `def.fields` entry,
 * replacing the per-type hand-forms. The five built-in types render the SAME
 * fields/labels/limits as before (their registry `fields` mirror the old forms).
 *
 * sim.ai right-panel parity (#594): fields are grouped into typed sections by
 * their optional `section` label (see {@link groupFieldSections}). A node with no
 * sectioned fields renders one default group with no heading — i.e. the same flat
 * form as before — so simple types are visually unchanged. Pattern provenance
 * lives in `fieldSections.ts` (sim = palette + inspector sections, dify =
 * registry-driven auto-form).
 *
 * Cache-first (AGENTS.md #9): values seed from `node.data.subBlocks` (display);
 * writes go through `patch.patchNode` (authoritative, debounced). Forms re-seed
 * on selection change because the parent keys the inspector by block id.
 */
export function AutoForm({ def, node, patch }: AutoFormProps) {
	const sections = groupFieldSections(def.fields);
	const showHeadings = shouldShowSectionHeadings(sections);

	return (
		<div className="flex flex-col gap-4">
			{def.inspectorHelp && (
				<p className="text-[11px] text-muted-foreground">{def.inspectorHelp}</p>
			)}
			{sections.map((section) => (
				<section key={section.label} className="flex flex-col gap-3">
					{showHeadings && (
						<h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
							{section.label}
						</h4>
					)}
					{section.fields.map((field) => (
						<AutoField
							key={field.key}
							field={field}
							node={node}
							patch={patch}
						/>
					))}
				</section>
			))}
		</div>
	);
}

function AutoField({
	field,
	node,
	patch,
}: {
	field: NodeFieldDef;
	node: PipelineFlowNode;
	patch: NodePatchApi;
}) {
	switch (field.kind) {
		case "select":
			return <SelectField field={field} node={node} patch={patch} />;
		case "textarea":
			return <TextareaField field={field} node={node} patch={patch} />;
		case "number":
			return <NumberField field={field} node={node} patch={patch} />;
		case "boolean":
			return <BooleanField field={field} node={node} patch={patch} />;
		case "key-value":
			return <KeyValueField field={field} node={node} patch={patch} />;
		default:
			return <TextField field={field} node={node} patch={patch} />;
	}
}

function readString(sub: Record<string, unknown> | undefined, key: string) {
	const raw = sub?.[key];
	return typeof raw === "string" ? raw : "";
}
function readNumberString(
	sub: Record<string, unknown> | undefined,
	key: string,
) {
	const raw = sub?.[key];
	return typeof raw === "number" ? String(raw) : "";
}

function FieldHelp({ field }: { field: NodeFieldDef }) {
	if (!field.description) return null;
	return (
		<p className="text-[11px] text-muted-foreground">{field.description}</p>
	);
}

function applyCommit(
	patch: NodePatchApi,
	blockId: string,
	key: string,
	value: unknown | null,
) {
	if (value === null) {
		patch.patchNode(blockId, { deleteSubBlockKeys: [key] });
	} else {
		patch.patchNode(blockId, { subBlocksPatch: { [key]: value } });
	}
}

function TextField({
	field,
	node,
	patch,
}: {
	field: NodeFieldDef;
	node: PipelineFlowNode;
	patch: NodePatchApi;
}) {
	const id = useId();
	const [value, setValue] = useState(() =>
		readString(node.data.subBlocks, field.key),
	);
	const commit = () => {
		const next = commitTextField(value, field);
		applyCommit(patch, node.data.blockId, field.key, next);
		setValue(next ?? "");
	};
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id} className="text-xs">
				{field.label}
			</Label>
			<Input
				id={id}
				className="h-8 text-xs"
				placeholder={field.placeholder}
				value={value}
				maxLength={field.maxLength}
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				}}
			/>
			<FieldHelp field={field} />
		</div>
	);
}

function NumberField({
	field,
	node,
	patch,
}: {
	field: NodeFieldDef;
	node: PipelineFlowNode;
	patch: NodePatchApi;
}) {
	const id = useId();
	const [value, setValue] = useState(() =>
		readNumberString(node.data.subBlocks, field.key),
	);
	const commit = () => {
		const next = commitNumberField(value, field);
		applyCommit(patch, node.data.blockId, field.key, next);
		setValue(next === null ? "" : String(next));
	};
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id} className="text-xs">
				{field.label}
			</Label>
			<Input
				id={id}
				type="number"
				min={field.min}
				max={field.max}
				step={field.step}
				className="h-8 text-xs"
				placeholder={field.placeholder}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				}}
			/>
			<FieldHelp field={field} />
		</div>
	);
}

function TextareaField({
	field,
	node,
	patch,
}: {
	field: NodeFieldDef;
	node: PipelineFlowNode;
	patch: NodePatchApi;
}) {
	const id = useId();
	const [value, setValue] = useState(() =>
		readString(node.data.subBlocks, field.key),
	);
	const commit = () => {
		const next = commitTextField(value, field);
		applyCommit(patch, node.data.blockId, field.key, next);
		setValue(next ?? "");
	};
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id} className="text-xs">
				{field.label}
			</Label>
			<Textarea
				id={id}
				className="min-h-20 text-xs"
				placeholder={field.placeholder}
				maxLength={field.maxLength}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
			/>
			<FieldHelp field={field} />
		</div>
	);
}

function BooleanField({
	field,
	node,
	patch,
}: {
	field: NodeFieldDef;
	node: PipelineFlowNode;
	patch: NodePatchApi;
}) {
	const id = useId();
	const raw = node.data.subBlocks?.[field.key];
	const checked = raw === true;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between">
				<Label htmlFor={id} className="text-xs">
					{field.label}
				</Label>
				<Switch
					id={id}
					checked={checked}
					onCheckedChange={(value) =>
						patch.patchNode(node.data.blockId, {
							subBlocksPatch: { [field.key]: value },
						})
					}
				/>
			</div>
			<FieldHelp field={field} />
		</div>
	);
}

/**
 * Select field. Static `options` render directly; a dynamic `optionsSource` is
 * resolved by the editor — currently `roles` (the org's agent roles). Cache-first:
 * the bound value renders immediately from node data; the option list only gates
 * the human-readable label / "not found" hint.
 */
function SelectField({
	field,
	node,
	patch,
}: {
	field: NodeFieldDef;
	node: PipelineFlowNode;
	patch: NodePatchApi;
}) {
	const bound = readString(node.data.subBlocks, field.key);
	const { options, isLoading } = useSelectOptions(field);

	const onChange = (value: string) => {
		const next = commitSelectField(value);
		applyCommit(patch, node.data.blockId, field.key, next);
	};

	const boundInList = options.some((o) => o.value === bound);
	const boundUnknown = bound.length > 0 && !boundInList && !isLoading;

	return (
		<div className="flex flex-col gap-1.5">
			<Label className="text-xs">{field.label}</Label>
			<Select value={bound || SELECT_NONE} onValueChange={onChange}>
				<SelectTrigger className="h-8 text-xs">
					<SelectValue placeholder={field.placeholder} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={SELECT_NONE}>Без значения</SelectItem>
					{options.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{boundUnknown && (
				<p className="text-[11px] text-amber-500">
					Не найдено: <span className="font-mono">{bound}</span>
				</p>
			)}
			{field.required && !bound && <FieldHelp field={field} />}
		</div>
	);
}

/** Resolve select options from static `options` or a dynamic `optionsSource`. */
function useSelectOptions(field: NodeFieldDef): {
	options: { value: string; label: string }[];
	isLoading: boolean;
} {
	const trpc = useTRPC();
	const isRoles = field.optionsSource === "roles";
	const rolesQuery = useQuery({
		...trpc.agentRole.list.queryOptions({}),
		enabled: isRoles,
	});

	if (field.options) return { options: field.options, isLoading: false };
	if (isRoles) {
		const roles = rolesQuery.data ?? [];
		return {
			options: roles.map((role) => ({
				value: role.skill.slug,
				label: role.skill.name,
			})),
			isLoading: rolesQuery.isLoading,
		};
	}
	return { options: [], isLoading: false };
}

type KvPair = { id: string; key: string; value: string };

/**
 * Key-value editor. Stores a `Record<string, string>` in `subBlocks[field.key]`.
 * Rows commit on blur; an empty key removes the row. Blank record deletes the key.
 */
function KeyValueField({
	field,
	node,
	patch,
}: {
	field: NodeFieldDef;
	node: PipelineFlowNode;
	patch: NodePatchApi;
}) {
	const reactId = useId();
	const initial = node.data.subBlocks?.[field.key];
	const [rows, setRows] = useState<KvPair[]>(() => kvToRows(initial, reactId));

	const commit = (next: KvPair[]) => {
		setRows(next);
		const record: Record<string, string> = {};
		for (const row of next) {
			const k = row.key.trim();
			if (k.length > 0) record[k] = row.value;
		}
		applyCommit(
			patch,
			node.data.blockId,
			field.key,
			Object.keys(record).length > 0 ? record : null,
		);
	};

	const updateRow = (id: string, patchRow: Partial<KvPair>) =>
		rows.map((row) => (row.id === id ? { ...row, ...patchRow } : row));

	return (
		<div className="flex flex-col gap-1.5">
			<Label className="text-xs">{field.label}</Label>
			<div className="flex flex-col gap-1.5">
				{rows.map((row) => (
					<div key={row.id} className="flex gap-1.5">
						<Input
							className="h-8 text-xs"
							placeholder="ключ"
							value={row.key}
							onChange={(e) =>
								setRows(updateRow(row.id, { key: e.target.value }))
							}
							onBlur={() => commit(rows)}
						/>
						<Input
							className="h-8 text-xs"
							placeholder="значение"
							value={row.value}
							onChange={(e) =>
								setRows(updateRow(row.id, { value: e.target.value }))
							}
							onBlur={() => commit(rows)}
						/>
					</div>
				))}
				<button
					type="button"
					className="self-start text-[11px] text-primary hover:underline"
					onClick={() =>
						setRows([
							...rows,
							{ id: `${reactId}-${rows.length}`, key: "", value: "" },
						])
					}
				>
					+ Добавить
				</button>
			</div>
			<FieldHelp field={field} />
		</div>
	);
}

function kvToRows(raw: unknown, idPrefix: string): KvPair[] {
	if (typeof raw !== "object" || raw === null) return [];
	return Object.entries(raw as Record<string, unknown>).map(
		([key, value], i) => ({
			id: `${idPrefix}-${i}`,
			key,
			value: typeof value === "string" ? value : String(value ?? ""),
		}),
	);
}
