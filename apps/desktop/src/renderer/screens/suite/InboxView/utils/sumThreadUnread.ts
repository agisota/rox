/**
 * Sum the per-thread unread counts into one total. Platform-neutral and pure so
 * the web/mobile sidebars can reuse the exact same unread model the desktop
 * inbox rail and sidebar badge are built on (issue #562 — cross-platform core).
 *
 * Mail threads currently report `unreadCount: 0` (the per-user mail-unread
 * aggregate is backend #521); until that lands the total is chat-only, which is
 * exactly what the callers pass in.
 */
export function sumThreadUnread(
	threads: readonly { unreadCount?: number | null }[],
): number {
	return threads.reduce((sum, t) => sum + (t.unreadCount ?? 0), 0);
}
