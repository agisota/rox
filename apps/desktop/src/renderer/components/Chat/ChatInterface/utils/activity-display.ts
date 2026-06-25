/**
 * F39 — Desktop adapter between normalized workspace tool parts and the shared,
 * framework-agnostic Activity model (`@rox/chat/shared`).
 *
 * This is the single desktop bridge that turns a `ToolPart` into:
 * - an `ActivityToolCall` (serializable, fed to `bucketActivityToolCalls`), and
 * - the icon + per-tool title/subtitle used by the detail rows.
 *
 * The verb taxonomy + tense/count labels themselves live in the shared mapper;
 * this file only resolves desktop-specific icons and the path/query subtitle.
 */

import type { ActivityToolCall } from "@rox/chat/shared";
import { getActivityVerbLabel, mapToolToVerb } from "@rox/chat/shared";
import {
	FileIcon,
	FilePenIcon,
	FileSearchIcon,
	FolderTreeIcon,
	GlobeIcon,
	type LucideIcon,
	SearchIcon,
	SparklesIcon,
	TerminalIcon,
} from "lucide-react";
import { getWorkspaceToolFilePath } from "./file-paths";
import type { ToolPart } from "./tool-helpers";
import { getArgs, normalizeToolName } from "./tool-helpers";

const VERB_ICONS: Record<string, LucideIcon> = {
	shell: TerminalIcon,
	read: FileIcon,
	search: SearchIcon,
	write: FilePenIcon,
	skill: SparklesIcon,
	web: GlobeIcon,
	other: FileIcon,
};

/** Resolves the icon for a tool part's verb bucket, with per-tool overrides. */
export function getToolIcon(toolName: string): LucideIcon {
	const name = normalizeToolName(toolName);
	if (name === "mastra_workspace_list_files") return FolderTreeIcon;
	if (name === "mastra_workspace_file_stat") return FileSearchIcon;
	const verb = mapToolToVerb(name);
	return VERB_ICONS[verb] ?? FileIcon;
}

/** Extracts a one-line detail (path / query / command) for the expanded row. */
function getToolDetail(part: ToolPart): string {
	const name = normalizeToolName(getToolName(part));
	const args = getArgs(part);
	const raw =
		getWorkspaceToolFilePath({ toolName: name, args }) ??
		String(
			args.query ??
				args.pattern ??
				args.regex ??
				args.substring_pattern ??
				args.command ??
				args.text ??
				args.path ??
				"",
		);
	// Show just the filename for long paths.
	return raw.includes("/") ? (raw.split("/").pop() ?? raw) : raw;
}

function getToolName(part: ToolPart): string {
	return (part.type as string).replace(/^tool-/, "");
}

function isPending(part: ToolPart): boolean {
	return part.state !== "output-available" && part.state !== "output-error";
}

/**
 * Per-tool title for a detail row, using the shared verb label and the call's
 * tense. e.g. a running read → "Чтение", a settled read → "Прочитано".
 */
export function getToolTitle(part: ToolPart): string {
	const verb = mapToolToVerb(normalizeToolName(getToolName(part)));
	const label = getActivityVerbLabel(verb);
	return isPending(part) ? label.present : label.past;
}

/** Projects a normalized tool part onto the serializable Activity model. */
export function toActivityToolCall(part: ToolPart): ActivityToolCall {
	return {
		id: part.toolCallId,
		name: normalizeToolName(getToolName(part)),
		isPending: isPending(part),
		isError: part.state === "output-error",
		detail: getToolDetail(part),
	};
}
