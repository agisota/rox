import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveWorkspaceStarterPreset } from "@rox/shared/workspace-starter-presets";
import { TRPCError } from "@trpc/server";
import {
	getProjectConfigPath,
	type SetupConfig,
} from "../../../../runtime/setup/config";

export interface ApplyWorkspaceStarterPresetsArgs {
	repoPath: string;
	starterPresetIds?: readonly string[];
}

function readConfig(configPath: string): Record<string, unknown> {
	if (!existsSync(configPath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		return {};
	}
	return {};
}

function mergeSetupCommands(
	existing: unknown,
	nextCommands: readonly string[],
): string[] {
	const merged = Array.isArray(existing)
		? existing.filter(
				(command): command is string => typeof command === "string",
			)
		: [];
	for (const command of nextCommands) {
		if (!merged.includes(command)) merged.push(command);
	}
	return merged;
}

export function applyWorkspaceStarterPresets(
	args: ApplyWorkspaceStarterPresetsArgs,
): void {
	if (!args.starterPresetIds || args.starterPresetIds.length === 0) return;

	const setupCommands: string[] = [];
	const scaffoldFiles = new Map<string, string>();

	for (const starterPresetId of args.starterPresetIds) {
		const resolved = resolveWorkspaceStarterPreset(starterPresetId);
		if (!resolved) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Unknown workspace starter preset: ${starterPresetId}`,
			});
		}
		for (const command of resolved.setupCommands) {
			if (!setupCommands.includes(command)) setupCommands.push(command);
		}
		for (const file of resolved.scaffoldFiles) {
			if (!scaffoldFiles.has(file.path))
				scaffoldFiles.set(file.path, file.contents);
		}
	}

	for (const [relativePath, contents] of scaffoldFiles) {
		const targetPath = join(args.repoPath, relativePath);
		if (existsSync(targetPath)) continue;
		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(targetPath, contents, "utf-8");
	}

	if (setupCommands.length === 0) return;

	const configPath = getProjectConfigPath(args.repoPath);
	mkdirSync(dirname(configPath), { recursive: true });
	const existing = readConfig(configPath);
	const merged: SetupConfig & Record<string, unknown> = {
		...existing,
		setup: mergeSetupCommands(existing.setup, setupCommands),
	};
	writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
}
