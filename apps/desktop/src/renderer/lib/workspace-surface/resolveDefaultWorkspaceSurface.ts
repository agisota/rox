import {
	type DefaultWorkspaceSurface,
	useChatPreferencesStore,
} from "renderer/stores/chat-preferences";

/**
 * Single source of truth for the surface a workspace should land on by default
 * across EVERY workspace create/open entry point (open-worktree, open-main-repo,
 * create-from-PR, new-project prompt). Honors the user's stored preference and
 * otherwise defaults to "chat".
 *
 * Usable outside React (e.g. inside zustand actions or effect callbacks) because
 * it reads the persisted store via `getState()`.
 */
export function resolveDefaultWorkspaceSurface(): DefaultWorkspaceSurface {
	return useChatPreferencesStore.getState().defaultWorkspaceSurface ?? "chat";
}
