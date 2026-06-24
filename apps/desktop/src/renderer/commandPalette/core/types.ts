import type { ExternalApp } from "@rox/local-db";
import type { ElementType } from "react";
import type { HotkeyId } from "renderer/hotkeys/registry";
import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";

export type SectionId = "workspace" | "actions" | "navigation";

export interface CommandContext {
	route: {
		pathname: string;
		params: Record<string, string>;
	};
	workspace: {
		id: string;
		name: string;
		projectId?: string;
		workspaceType?: "main" | "worktree";
		hostId?: string;
		preferredOpenInApp?: ExternalApp;
	} | null;
	activeHostUrl: string | null;
	activeOrganizationId: string | null;
	activeOrganizationName: string | null;
	hostServiceStatus: HostServiceAvailabilityStatus;
	localMachineId: string | null;
	notificationSoundsMuted: boolean;
	navigate: (path: string) => void;
	focusedView?: "editor" | "terminal" | "git" | "issues" | "files" | "chat";
	/**
	 * Whether the `agentNative.commandPalette` experimental feature is usable
	 * (enabled AND resolves `available`). Providers gated on Agent-Native
	 * actions read this instead of calling the `useExperimentalFeature` hook,
	 * because `CommandProvider.provide` is a plain function evaluated outside a
	 * React render. Defaults to `false` (treat as off) when not supplied.
	 */
	experimentalAgentCommandPalette?: boolean;
	/**
	 * Whether the `agentNative.sourceMarketplace` experimental feature is usable
	 * (enabled AND resolves `available`). Carried on the context for the same
	 * reason as {@link experimentalAgentCommandPalette}: `provide` runs outside a
	 * React render and cannot call `useExperimentalFeature`. The "Подключить
	 * источник агента" command reads this to decide whether to navigate to the
	 * in-desktop sources route (gate on) or stay honestly disabled (gate off).
	 * Defaults to `false` (treat as off) when not supplied.
	 */
	experimentalAgentSourceMarketplace?: boolean;
}

export interface Command {
	id: string;
	title: string;
	section: SectionId;
	icon?: ElementType<{ className?: string }>;
	iconUrl?: string;
	keywords?: string[];
	hotkeyId?: HotkeyId;
	disabled?: boolean;
	disabledReason?: string;
	when?: (context: CommandContext) => boolean;
	run?: (context: CommandContext) => void | Promise<void>;
	children?: Command[] | ((context: CommandContext) => Command[]);
	renderFrame?: () => React.ReactNode;
}

export interface CommandProvider {
	id: string;
	provide: (context: CommandContext) => Command[];
}

export interface CommandSection {
	id: SectionId;
	label: string;
	commands: Command[];
}
