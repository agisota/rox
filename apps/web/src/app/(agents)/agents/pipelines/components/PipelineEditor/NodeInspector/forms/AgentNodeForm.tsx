"use client";

import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import type { NodeFormProps } from "./types";

/** Sentinel Select value for "no role bound" (Radix Select forbids empty value). */
const NO_ROLE = "__none__";

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
	const [modelOverride, setModelOverride] = useState(() =>
		readString(sub, "modelOverride"),
	);
	const [maxTurns, setMaxTurns] = useState(() => readNumber(sub, "maxTurns"));
	const [temperature, setTemperature] = useState(() =>
		readNumber(sub, "temperature"),
	);

	const slugInList = roles.some((r) => r.skill.slug === boundSlug);
	const boundUnknown =
		boundSlug.length > 0 && !slugInList && !rolesQuery.isLoading;

	const onRoleChange = (value: string) => {
		if (value === NO_ROLE) {
			patch.patchNode(node.data.blockId, { deleteSubBlockKeys: ["roleSlug"] });
			return;
		}
		patch.patchNode(node.data.blockId, { subBlocksPatch: { roleSlug: value } });
	};

	const commitModel = () => {
		const trimmed = modelOverride.trim().slice(0, 200);
		if (trimmed.length === 0) {
			patch.patchNode(node.data.blockId, {
				deleteSubBlockKeys: ["modelOverride"],
			});
			setModelOverride("");
			return;
		}
		patch.patchNode(node.data.blockId, {
			subBlocksPatch: { modelOverride: trimmed },
		});
		setModelOverride(trimmed);
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
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="agent-model-override" className="text-xs">
					Модель (переопределение)
				</Label>
				<Input
					id="agent-model-override"
					className="h-8 text-xs"
					placeholder="напр. gpt-5 (необязательно)"
					value={modelOverride}
					maxLength={200}
					onChange={(e) => setModelOverride(e.target.value)}
					onBlur={commitModel}
					onKeyDown={(e) => {
						if (e.key === "Enter") e.currentTarget.blur();
					}}
				/>
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
