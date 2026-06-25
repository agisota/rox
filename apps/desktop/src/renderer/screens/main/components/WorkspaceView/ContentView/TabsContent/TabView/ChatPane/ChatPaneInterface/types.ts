import type { ScrollbackRecent } from "@rox/ui/ai-elements/message-scrollback-rail";
import type { StartFreshSessionResult } from "renderer/components/Chat/ChatInterface/types";
import type { ChatLaunchConfig } from "shared/tabs-types";

export interface ChatPaneInterfaceProps {
	paneId: string;
	sessionId: string | null;
	initialLaunchConfig: ChatLaunchConfig | null;
	workspaceId: string;
	organizationId: string | null;
	cwd: string;
	isFocused: boolean;
	isSessionReady: boolean;
	ensureSessionReady: () => Promise<boolean>;
	onStartFreshSession: () => Promise<StartFreshSessionResult>;
	onConsumeLaunchConfig: () => void;
	onUserMessageSubmitted?: (message: string) => void;
	/** Cross-session recents (~10) for the scrollback rail's Recents-flyout (F49). */
	recents?: ScrollbackRecent[];
	/** Jump to a recent session from the rail's Recents-flyout (F49). */
	onSelectRecent?: (sessionId: string) => void;
}
