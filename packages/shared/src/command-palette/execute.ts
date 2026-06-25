import type { Command } from "./types";

/**
 * Side-effect hooks injected by each host so the neutral core never imports a
 * toast library or analytics client. Desktop wires `@rox/ui/sonner` + its
 * `track`; web/mobile wire their own equivalents.
 */
export interface ExecuteHooks {
	track?: (event: string, props: Record<string, unknown>) => void;
	notifyInfo?: (message: string) => void;
	notifyError?: (message: string) => void;
}

/**
 * Run a command against the given context, applying the shared guard/error
 * semantics: disabled commands surface their reason and short-circuit; thrown
 * errors are reported via the injected `notifyError` hook rather than bubbling.
 */
export async function executeCommand<Ctx>(
	command: Command<Ctx>,
	context: Ctx,
	hooks: ExecuteHooks = {},
): Promise<void> {
	hooks.track?.("command_run", {
		commandId: command.id,
		section: command.section,
	});
	if (command.disabled) {
		if (command.disabledReason) hooks.notifyInfo?.(command.disabledReason);
		return;
	}
	if (!command.run) return;
	try {
		await command.run(context);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		hooks.notifyError?.(`Command "${command.title}" failed: ${message}`);
	}
}
