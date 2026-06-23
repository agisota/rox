import { PROTOCOL_SCHEMES } from "@rox/shared/constants";
import {
	ROX_HOME_DIR_NAME,
	PROJECT_ROX_DIR_NAME as SHARED_PROJECT_ROX_DIR_NAME,
} from "@rox/shared/rox-dirs";
import { getWorkspaceName } from "./env.shared";

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

const workspace = getWorkspaceName();
// Per-user home dir name. Now visible (`rox` / `rox-<workspace>`), formerly
// dot-hidden (`.rox`). Existing `~/.rox` is auto-migrated at app startup.
export const ROX_DIR_NAME = workspace
	? `${ROX_HOME_DIR_NAME}-${workspace}`
	: ROX_HOME_DIR_NAME;
export const PROTOCOL_SCHEME = workspace
	? `rox-${workspace}`
	: PROTOCOL_SCHEMES.PROD;
// Project-level directory name (always the same, not conditional).
export const PROJECT_ROX_DIR_NAME = SHARED_PROJECT_ROX_DIR_NAME;
export const WORKTREES_DIR_NAME = "worktrees";
export const PROJECTS_DIR_NAME = "projects";
export const CONFIG_FILE_NAME = "config.json";
export const LOCAL_CONFIG_FILE_NAME = "config.local.json";
export const PORTS_FILE_NAME = "ports.json";

export const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": [],
  "run": []
}`;

export const NOTIFICATION_EVENTS = {
	AGENT_LIFECYCLE: "agent-lifecycle",
	FOCUS_TAB: "focus-tab",
	FOCUS_V2_NOTIFICATION_SOURCE: "focus-v2-notification-source",
	TERMINAL_EXIT: "terminal-exit",
} as const;

// Development/testing mock values (used when SKIP_ENV_VALIDATION is set).
// UUID-shaped so it satisfies the same `z.string().uuid()` validators the real
// organization id flows through (e.g. canvas fixtures, agents.run).
export const MOCK_ORG_ID = "00000000-0000-4000-8000-000000000001";

// Canvas E2E/smoke fixture identifiers. UUID-shaped so packaged smoke paths can
// exercise production tRPC validators without weakening them.
export const E2E_CANVAS_FIXTURE = {
	organizationId: MOCK_ORG_ID,
	projectId: "00000000-0000-4000-8000-000000000002",
	workspaceId: "00000000-0000-4000-8000-000000000003",
} as const;

// Terminal defaults
export const DEFAULT_TERMINAL_SCROLLBACK = 5000;

// Default user preference values
export const DEFAULT_CONFIRM_ON_QUIT = true;
export const DEFAULT_TERMINAL_LINK_BEHAVIOR = "file-viewer" as const;
export const DEFAULT_FILE_OPEN_MODE = "split-pane" as const;
export const DEFAULT_AUTO_APPLY_DEFAULT_PRESET = true;
export const DEFAULT_SHOW_PRESETS_BAR = true;
export const DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON = true;
export const DEFAULT_TELEMETRY_ENABLED = true;
export const DEFAULT_SHOW_RESOURCE_MONITOR = true;
export const DEFAULT_OPEN_LINKS_IN_APP = false;
export const DEFAULT_EXPOSE_HOST_SERVICE_VIA_RELAY = false;

// Voice / ambient defaults (Phase 4a). Plain dictation is on by default; the
// always-on ambient capture is opt-in (off) per the locked privacy decision.
export const DEFAULT_DICTATION_ENABLED = true;
export const DEFAULT_AMBIENT_CAPTURE_ENABLED = false;
export const DEFAULT_VOICE_AGENT_CONTEXT = "";

// Push-to-talk (live.pushToTalkDesktop). The global shortcut is an Electron
// `globalShortcut` accelerator (press-only, no key-up), so this is a
// TOGGLE-to-talk binding: pressing it flips the active voice room's mic mute.
// Stored verbatim in the settings table as a native Electron accelerator string
// so the main process can register it without translating renderer chords.
// `Shift` is included so the global binding does not collide with the
// window-focused ⌘M / system minimize.
export const DEFAULT_PUSH_TO_TALK_ACCELERATOR = "CommandOrControl+Shift+M";

// External links (documentation, help resources, etc.)
export const EXTERNAL_LINKS = {
	SETUP_TEARDOWN_SCRIPTS: `${process.env.NEXT_PUBLIC_DOCS_URL}/setup-teardown-scripts`,
} as const;
