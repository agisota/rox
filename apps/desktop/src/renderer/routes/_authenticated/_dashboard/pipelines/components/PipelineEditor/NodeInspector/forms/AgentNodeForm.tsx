import { AVAILABLE_CHAT_MODELS } from "@rox/shared/chat-models";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import type { NodeFormProps } from "./types";

/** Sentinel Select value for "no role bound" (Radix Select forbids empty value). */
const NO_ROLE = "__none__";
/**
 * Sentinel for "inherit the role's model" (no per-node override). Radix Select
 * forbids an empty value, so we use a non-id token and map it to "delete the
 * modelOverride subBlock".
 */
const MODEL_INHERIT = "__inherit__";

/**
 * Group the canonical chat-model catalog by provider so the node model dropdown
 * mirrors the chat ModelPicker's grouped layout (dify parity). Same source list
 * (`AVAILABLE_CHAT_MODELS`) the chat composer feeds its picker, so a node runs a
 * real, resolvable model id — not a free-text guess.
 */
function groupModelsByProvider() {
	const groups = new Map<string, (typeof AVAILABLE_CHAT_MODELS)[number][]>();
	for (const model of AVAILABLE_CHAT_MODELS) {
		const list = groups.get(model.provider) ?? [];
		list.push(model);
		groups.set(model.provider, list);
	}
	return [...groups.entries()];
}

function readString(sub: Record<string, unknown> | undefined, key: string) {
	const raw = sub?.[key];
	return typeof raw === "string" ? raw : "";
}
function readNumber(sub: Record<string, unknown> | undefined, key: string) {
	const raw = sub?.[key];
	return typeof raw === "number" ? String(raw) : "";
}

/**
 * Agent-role node config. Binds a role by writing `subBlocks.roleSlug` (a pointer
 * into the org's agent roles) and optional per-node overrides
 * (`modelOverride`/`maxTurns`/`temperature`) into subBlocks. It never calls
 * `agentRole.update` — editing the shared role bundle belongs to the role editor.
 *
 * Cache-first (AGENTS.md #9): the bound slug renders immediately from node data;
 * the role list only gates the human-readable name / "роль не найдена" hint.
 */
export function AgentNodeForm({ node, patch }: NodeFormProps) {
	const trpc = useTRPC();
	const rolesQuery = useQuery(trpc.agentRole.list.queryOptions({}));
	const roles = rolesQuery.data ?? [];

	const sub = node.data.subBlocks;
	const boundSlug = node.data.roleSlug ?? "";
	// Per-node model override id (persisted in subBlocks.modelOverride). Seeds from
	// node data; the dropdown writes a real catalog id from AVAILABLE_CHAT_MODELS.
	const modelOverride = readString(sub, "modelOverride");
	const modelGroups = useMemo(groupModelsByProvider, []);
	// A persisted id that is not in the current catalog (e.g. a legacy free-text
	// value typed before the dropdown existed) is surfaced as a warning + a
	// recoverable extra option so it neither vanishes silently nor blocks editing.
	const modelKnown =
		modelOverride.length === 0 ||
		AVAILABLE_CHAT_MODELS.some((m) => m.id === modelOverride);
	const [maxTurns, setMaxTurns] = useState(() => readNumber(sub, "maxTurns"));
	const [temperature, setTemperature] = useState(() =>
		readNumber(sub, "temperature"),
	);

	const slugInList = roles.some((r) => r.skill.slug === boundSlug);
	const boundUnknown =
		boundSlug.length > 0 && !slugInList && !rolesQuery.isLoading;
	// Preview of what the bound role does (dify parity: see the node's config at a
	// glance). Cache-first: renders from the already-loaded role list.
	const boundRole = roles.find((r) => r.skill.slug === boundSlug);
	const rolePreview = boundRole?.skill.description ?? null;

	const onRoleChange = (value: string) => {
		if (value === NO_ROLE) {
			patch.patchNode(node.data.blockId, { deleteSubBlockKeys: ["roleSlug"] });
			return;
		}
		patch.patchNode(node.data.blockId, { subBlocksPatch: { roleSlug: value } });
	};

	const onModelChange = (value: string) => {
		if (value === MODEL_INHERIT) {
			patch.patchNode(node.data.blockId, {
				deleteSubBlockKeys: ["modelOverride"],
			});
			return;
		}
		patch.patchNode(node.data.blockId, {
			subBlocksPatch: { modelOverride: value },
		});
	};

	const commitMaxTurns = () => {
		const trimmed = maxTurns.trim();
		if (trimmed.length === 0) {
			patch.patchNode(node.data.blockId, { deleteSubBlockKeys: ["maxTurns"] });
			return;
		}
		const parsed = Number(trimmed);
		if (!Number.isFinite(parsed)) return;
		const clamped = Math.min(200, Math.max(1, Math.round(parsed)));
		patch.patchNode(node.data.blockId, {
			subBlocksPatch: { maxTurns: clamped },
		});
		setMaxTurns(String(clamped));
	};

	const commitTemperature = () => {
		const trimmed = temperature.trim();
		if (trimmed.length === 0) {
			patch.patchNode(node.data.blockId, {
				deleteSubBlockKeys: ["temperature"],
			});
			return;
		}
		const parsed = Number(trimmed);
		if (!Number.isFinite(parsed)) return;
		const clamped = Math.min(2, Math.max(0, parsed));
		patch.patchNode(node.data.blockId, {
			subBlocksPatch: { temperature: clamped },
		});
		setTemperature(String(clamped));
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Роль агента</Label>
				<Select value={boundSlug || NO_ROLE} onValueChange={onRoleChange}>
					<SelectTrigger className="h-8 text-xs">
						<SelectValue placeholder="Выберите роль" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NO_ROLE}>Без роли</SelectItem>
						{roles.map((role) => (
							<SelectItem key={role.skill.id} value={role.skill.slug}>
								{role.skill.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{boundUnknown && (
					<p className="text-[11px] text-amber-500">
						Роль не найдена: <span className="font-mono">{boundSlug}</span>
					</p>
				)}
				{!boundSlug && (
					<p className="text-[11px] text-muted-foreground">
						Узел не выполнится без привязанной роли.
					</p>
				)}
				{rolePreview && (
					<p className="line-clamp-3 rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground">
						{rolePreview}
					</p>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Модель (переопределение)</Label>
				<Select
					value={modelOverride || MODEL_INHERIT}
					onValueChange={onModelChange}
				>
					<SelectTrigger className="h-8 text-xs" aria-label="Модель узла">
						<SelectValue placeholder="Модель роли" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={MODEL_INHERIT}>Как у роли</SelectItem>
						{/* Recover a persisted id that is no longer in the catalog (legacy
						    free-text) so selecting it stays possible and it is not dropped. */}
						{!modelKnown && (
							<SelectGroup>
								<SelectLabel className="text-amber-500">
									Неизвестная модель
								</SelectLabel>
								<SelectItem value={modelOverride}>{modelOverride}</SelectItem>
							</SelectGroup>
						)}
						{modelGroups.map(([provider, models]) => (
							<SelectGroup key={provider}>
								<SelectLabel>{provider}</SelectLabel>
								{models.map((model) => (
									<SelectItem key={model.id} value={model.id}>
										{model.name}
									</SelectItem>
								))}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>
				{!modelKnown && (
					<p className="text-[11px] text-amber-500">
						Модель не из каталога:{" "}
						<span className="font-mono">{modelOverride}</span>
					</p>
				)}
				{modelKnown && modelOverride.length === 0 && (
					<p className="text-[11px] text-muted-foreground">
						Узел запустится на модели, заданной ролью.
					</p>
				)}
			</div>

			<div className="grid grid-cols-2 gap-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="agent-max-turns" className="text-xs">
						Макс. шагов
					</Label>
					<Input
						id="agent-max-turns"
						type="number"
						min={1}
						max={200}
						step={1}
						className="h-8 text-xs"
						placeholder="1–200"
						value={maxTurns}
						onChange={(e) => setMaxTurns(e.target.value)}
						onBlur={commitMaxTurns}
						onKeyDown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
						}}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="agent-temperature" className="text-xs">
						Температура
					</Label>
					<Input
						id="agent-temperature"
						type="number"
						min={0}
						max={2}
						step={0.1}
						className="h-8 text-xs"
						placeholder="0–2"
						value={temperature}
						onChange={(e) => setTemperature(e.target.value)}
						onBlur={commitTemperature}
						onKeyDown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
						}}
					/>
				</div>
			</div>
		</div>
	);
}
