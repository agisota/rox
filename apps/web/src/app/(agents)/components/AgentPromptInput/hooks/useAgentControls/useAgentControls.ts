"use client";

import { authClient } from "@rox/auth/client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import type {
	AgentControlsData,
	AgentSourceOption,
	ChatSessionStatusValue,
	SkillBindingOption,
} from "./types";

const STATUS_OPTIONS: ChatSessionStatusValue[] = ["active", "archived"];

/**
 * Reads agent-native composer data via tRPC (agent sources, agent-tool/mcp skill
 * bindings) and owns the composer's local selection state (source, skills,
 * labels, status).
 *
 * Cache-first (AGENTS.md §9): queries are gated on an active organization, and
 * the returned `data` rows render immediately. Readiness/loading flags are used
 * only to decide what to show when there is no data yet — persisted rows are
 * never hidden behind `isLoading`.
 */
export function useAgentControls(): AgentControlsData {
	const trpc = useTRPC();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;
	const hasOrg = Boolean(organizationId);

	const sourcesQuery = useQuery({
		...trpc.agentSource.list.queryOptions({
			organizationId: organizationId ?? "",
		}),
		enabled: hasOrg,
	});

	const agentToolBindingsQuery = useQuery({
		...trpc.skill.listBindings.queryOptions({ surface: "agent_tool" }),
		enabled: hasOrg,
	});

	const mcpBindingsQuery = useQuery({
		...trpc.skill.listBindings.queryOptions({ surface: "mcp" }),
		enabled: hasOrg,
	});

	const skillsQuery = useQuery({
		...trpc.skill.list.queryOptions({}),
		enabled: hasOrg,
	});

	const sources: AgentSourceOption[] = useMemo(
		() =>
			(sourcesQuery.data ?? []).map((source) => ({
				id: source.id,
				name: source.name,
				slug: source.slug,
				kind: source.kind,
				status: source.status,
			})),
		[sourcesQuery.data],
	);

	const skillBindings: SkillBindingOption[] = useMemo(() => {
		const nameBySkillId = new Map(
			(skillsQuery.data ?? []).map((skill) => [skill.id, skill.name]),
		);
		const bindings = [
			...(agentToolBindingsQuery.data ?? []),
			...(mcpBindingsQuery.data ?? []),
		];
		const seen = new Set<string>();
		const options: SkillBindingOption[] = [];
		for (const binding of bindings) {
			if (seen.has(binding.id)) {
				continue;
			}
			seen.add(binding.id);
			options.push({
				id: binding.id,
				skillId: binding.skillId,
				surface: binding.surface as SkillBindingOption["surface"],
				label:
					binding.label ??
					nameBySkillId.get(binding.skillId) ??
					binding.skillId,
			});
		}
		return options;
	}, [agentToolBindingsQuery.data, mcpBindingsQuery.data, skillsQuery.data]);

	// Cache-first: treat "no rows" as the only loading/empty signal. Persisted
	// rows in `data` render regardless of these flags.
	const sourcesPending = sources.length === 0 && sourcesQuery.isLoading;
	const skillsPending =
		skillBindings.length === 0 &&
		(agentToolBindingsQuery.isLoading || mcpBindingsQuery.isLoading);

	const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
	const [selectedSkillBindingIds, setSelectedSkillBindingIds] = useState<
		string[]
	>([]);
	const [labels, setLabels] = useState<string[]>([]);
	const [status, setStatus] = useState<ChatSessionStatusValue>("active");

	const selectedSource = useMemo(
		() => sources.find((source) => source.id === selectedSourceId) ?? null,
		[sources, selectedSourceId],
	);

	const selectedSkillBindings = useMemo(
		() =>
			skillBindings.filter((binding) =>
				selectedSkillBindingIds.includes(binding.id),
			),
		[skillBindings, selectedSkillBindingIds],
	);

	const toggleSkillBinding = useCallback((bindingId: string) => {
		setSelectedSkillBindingIds((current) =>
			current.includes(bindingId)
				? current.filter((id) => id !== bindingId)
				: [...current, bindingId],
		);
	}, []);

	const addLabel = useCallback((label: string) => {
		const trimmed = label.trim();
		if (!trimmed) {
			return;
		}
		setLabels((current) =>
			current.includes(trimmed) ? current : [...current, trimmed],
		);
	}, []);

	const removeLabel = useCallback((label: string) => {
		setLabels((current) => current.filter((item) => item !== label));
	}, []);

	return {
		hasOrg,
		sources,
		sourcesPending,
		skillBindings,
		skillsPending,
		statusOptions: STATUS_OPTIONS,
		selectedSource,
		selectSource: setSelectedSourceId,
		selectedSkillBindings,
		toggleSkillBinding,
		labels,
		addLabel,
		removeLabel,
		status,
		setStatus,
	};
}
