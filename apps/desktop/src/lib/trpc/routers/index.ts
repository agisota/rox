import type { BrowserWindow } from "electron";
import { router } from "..";
import { createAnalyticsRouter } from "./analytics";
import { createAuthRouter } from "./auth";
import { createAutoUpdateRouter } from "./auto-update";
import { createBrowserRouter } from "./browser/browser";
import { createBrowserDataRouter } from "./browser-data";
import { createBrowserHistoryRouter } from "./browser-history";
import { createCacheRouter } from "./cache";
import { createChangesRouter } from "./changes";
import { createChatRuntimeServiceRouter } from "./chat-runtime-service";
import { createChatServiceRouter } from "./chat-service";
import { createConfigRouter } from "./config";
import { createDeviceRouter } from "./device";
import { createExternalRouter } from "./external";
import { createFilesystemRouter } from "./filesystem";
import { createHostServiceCoordinatorRouter } from "./host-service-coordinator";
import { createKeyboardLayoutRouter } from "./keyboardLayout";
import { createMenuRouter } from "./menu";
import { createMigrationRouter } from "./migration";
import { createNotificationsRouter } from "./notifications";
import { createPermissionsRouter } from "./permissions";
import { createPortsRouter } from "./ports";
import { createProjectsRouter } from "./projects";
import { createPushToTalkRouter } from "./push-to-talk";
import { createResourceMetricsRouter } from "./resource-metrics";
import { createRingtoneRouter } from "./ringtone";
import { createSavedPromptsRouter } from "./saved-prompts";
import { createSettingsRouter } from "./settings";
import { createSkillsLibraryRouter } from "./skills-library";
import { createSpectreRouter } from "./spectre";
import { createSystemRouter } from "./system";
import { createTerminalRouter } from "./terminal";
import { createUiStateRouter } from "./ui-state";
import { createWindowRouter } from "./window";
import { createWorkspacesRouter } from "./workspaces";

export const createAppRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		chatRuntimeService: createChatRuntimeServiceRouter(),
		chatService: createChatServiceRouter(),
		analytics: createAnalyticsRouter(),
		browser: createBrowserRouter(),
		browserHistory: createBrowserHistoryRouter(),
		browserData: createBrowserDataRouter(),
		auth: createAuthRouter(),
		autoUpdate: createAutoUpdateRouter(),
		cache: createCacheRouter(),
		window: createWindowRouter(getWindow),
		projects: createProjectsRouter(getWindow),
		workspaces: createWorkspacesRouter(),
		terminal: createTerminalRouter(),
		changes: createChangesRouter(),
		filesystem: createFilesystemRouter(),
		notifications: createNotificationsRouter(getWindow),
		permissions: createPermissionsRouter(),
		ports: createPortsRouter(),
		pushToTalk: createPushToTalkRouter(),
		resourceMetrics: createResourceMetricsRouter(),
		menu: createMenuRouter(),
		external: createExternalRouter(),
		settings: createSettingsRouter(),
		system: createSystemRouter(),
		config: createConfigRouter(),
		device: createDeviceRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(getWindow),
		hostServiceCoordinator: createHostServiceCoordinatorRouter(),
		keyboardLayout: createKeyboardLayoutRouter(),
		migration: createMigrationRouter(),
		savedPrompts: createSavedPromptsRouter(),
		skillsLibrary: createSkillsLibraryRouter(),
		spectre: createSpectreRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
