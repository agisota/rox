import {
	type IdentityStatusHuman,
	IdentityStatusLine,
} from "@rox/ui/atoms/IdentityStatusLine";
import { authClient } from "renderer/lib/auth-client";

interface IdentityStatusLineBarProps {
	/** Collapsed sidebar → render the always-compact avatar/glyph + count form. */
	isCollapsed?: boolean;
}

/**
 * Mounts the cross-platform `IdentityStatusLine` (Hermes-borrow F36) into the
 * desktop sidebar header — the КТО·ГДЕ·КАК status line. The active human comes
 * from the better-auth session (F21); the workspace, persona, and presence-count
 * (F25/F22/F37) are wired in as their sources land and are intentionally left
 * unset here so the line degrades to `@you` until then. The presentational
 * component itself carries the priority-truncation behaviour.
 */
export function IdentityStatusLineBar({
	isCollapsed = false,
}: IdentityStatusLineBarProps) {
	const { data: session } = authClient.useSession();
	const user = session?.user;
	if (!user) return null;

	const human: IdentityStatusHuman = {
		id: user.id,
		displayName: user.name || user.email || "You",
		avatarUrl: user.image ?? null,
		online: true,
	} satisfies IdentityStatusHuman;

	return (
		<div className="flex min-w-0 items-center px-2 py-1">
			<IdentityStatusLine human={human} compact={isCollapsed} />
		</div>
	);
}
