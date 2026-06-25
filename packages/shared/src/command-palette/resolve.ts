import type {
	Command,
	CommandProvider,
	CommandSection,
	SectionId,
} from "./types";

export interface ResolveOptions {
	/** Ordered section ids; sections absent here are dropped. */
	order: SectionId[];
	/** Human-readable label per section id. */
	labels: Record<SectionId, string>;
}

/**
 * Pure command resolution: run every provider, de-dupe by id, drop commands
 * whose `when` guard fails, then bucket into ordered, labelled sections.
 *
 * Shared by every host — the desktop `useActiveCommands` hook, the web cmdk
 * renderer and the mobile RN sheet all call this so ordering/de-dupe semantics
 * stay identical across platforms.
 */
export function resolveActiveCommands<Ctx>(
	providers: CommandProvider<Ctx>[],
	context: Ctx,
	options: ResolveOptions,
): CommandSection<Ctx>[] {
	const commands: Command<Ctx>[] = [];
	const seenIds = new Set<string>();
	for (const provider of providers) {
		for (const command of provider.provide(context)) {
			if (seenIds.has(command.id)) continue;
			if (command.when && !command.when(context)) continue;
			seenIds.add(command.id);
			commands.push(command);
		}
	}

	const bySection = new Map<SectionId, Command<Ctx>[]>();
	for (const command of commands) {
		const bucket = bySection.get(command.section);
		if (bucket) bucket.push(command);
		else bySection.set(command.section, [command]);
	}

	const sections: CommandSection<Ctx>[] = [];
	for (const id of options.order) {
		const list = bySection.get(id);
		if (!list || list.length === 0) continue;
		sections.push({ id, label: options.labels[id] ?? id, commands: list });
	}
	return sections;
}
