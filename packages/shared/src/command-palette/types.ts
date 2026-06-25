/**
 * Platform-neutral command-palette core (F44).
 *
 * The command model, provider registry, matcher and execute pipeline live here
 * so the desktop, web and mobile hosts share a single source of truth. Nothing
 * in this module imports React, Electron, the DOM, or React Native — hosts plug
 * in their own renderer and their own concrete context shape via the `Ctx`
 * generic.
 */

/** Section identifiers are host-defined strings (e.g. "workspace", "actions"). */
export type SectionId = string;

/**
 * Scope prefixes understood by the shared matcher. Aligns with the F45 slash
 * grammar so the two menus can be merged where it makes sense:
 *  - `>` commands · `#` tags · `@` profiles · `/` files
 */
export type ScopePrefix = ">" | "#" | "@" | "/";

/**
 * A single command. Generic over the host context (`Ctx`) so that desktop, web
 * and mobile can each supply their own context shape while reusing the registry,
 * matcher and execute pipeline. `icon`/`renderFrame` are typed as `unknown` here
 * because the neutral core never renders them — each host narrows them to its
 * own renderer type (`ElementType`, a RN component, etc.).
 */
export interface Command<Ctx = unknown> {
	id: string;
	title: string;
	section: SectionId;
	/** Host-rendered icon component. Opaque to the neutral core. */
	icon?: unknown;
	iconUrl?: string;
	keywords?: string[];
	/** Optional scope this command belongs to (e.g. "#" for a tag entry). */
	scope?: ScopePrefix;
	hotkeyId?: string;
	disabled?: boolean;
	disabledReason?: string;
	when?: (context: Ctx) => boolean;
	run?: (context: Ctx) => void | Promise<void>;
	children?: Command<Ctx>[] | ((context: Ctx) => Command<Ctx>[]);
	/** Host-rendered sub-frame. Opaque to the neutral core. */
	renderFrame?: () => unknown;
}

/** A provider contributes commands derived from the current context. */
export interface CommandProvider<Ctx = unknown> {
	id: string;
	provide: (context: Ctx) => Command<Ctx>[];
}

/** A resolved, ordered group of commands ready for rendering. */
export interface CommandSection<Ctx = unknown> {
	id: SectionId;
	label: string;
	commands: Command<Ctx>[];
}
