import type { Command, CommandProvider } from "../../core/types";

export type CanvasCommandIntentId = `canvas.${string}`;

export interface CanvasCommandHandler {
	title?: string;
	description?: string;
	shortcut?: string;
	keywords?: string[];
	disabled?: boolean;
	disabledReason?: string;
	run: () => void | Promise<void>;
}

const CANVAS_ROUTE_PATTERN = /(^|\/)canvas(\/|$)/;

let registrationVersion = 0;
let activeCanvasCommandHandlers = new Map<
	CanvasCommandIntentId,
	CanvasCommandHandler
>();

function isCanvasRoute(pathname: string): boolean {
	return CANVAS_ROUTE_PATTERN.test(pathname);
}

function titleFromCommandId(id: CanvasCommandIntentId): string {
	return id
		.replace(/^canvas\./, "")
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (char) => char.toUpperCase());
}

function toCommand(
	id: CanvasCommandIntentId,
	handler: CanvasCommandHandler,
): Command {
	const title = handler.title ?? titleFromCommandId(id);
	const description = handler.description ?? `Run ${id} on the active Canvas.`;
	const keywords = [
		id,
		description,
		handler.shortcut,
		handler.disabledReason,
		...(handler.keywords ?? []),
	].filter((keyword): keyword is string => Boolean(keyword?.trim()));

	return {
		id,
		title,
		section: "actions",
		keywords,
		disabled: handler.disabled,
		disabledReason: handler.disabledReason,
		run: () => handler.run(),
	};
}

export function registerCanvasCommandHandlers(
	handlers: Partial<Record<CanvasCommandIntentId, CanvasCommandHandler>>,
): () => void {
	const nextVersion = registrationVersion + 1;
	registrationVersion = nextVersion;
	activeCanvasCommandHandlers = new Map(
		Object.entries(handlers).filter(
			(entry): entry is [CanvasCommandIntentId, CanvasCommandHandler] =>
				Boolean(entry[1]),
		),
	);

	return () => {
		if (registrationVersion !== nextVersion) return;
		registrationVersion += 1;
		activeCanvasCommandHandlers = new Map();
	};
}

export function resetCanvasCommandHandlersForTest(): void {
	registrationVersion += 1;
	activeCanvasCommandHandlers = new Map();
}

export const canvasCommandsProvider: CommandProvider = {
	id: "canvas",
	provide: (context) => {
		if (!isCanvasRoute(context.route.pathname)) return [];
		return Array.from(activeCanvasCommandHandlers.entries()).map(
			([id, handler]) => toCommand(id, handler),
		);
	},
};
