export { type ExecuteHooks, executeCommand } from "./execute";
export {
	fuzzyScore,
	type MatchResult,
	matchCommands,
	type ParsedQuery,
	parseQuery,
} from "./matcher";
export { type CommandRegistry, createCommandRegistry } from "./registry";
export { type ResolveOptions, resolveActiveCommands } from "./resolve";
export type {
	Command,
	CommandProvider,
	CommandSection,
	ScopePrefix,
	SectionId,
} from "./types";
