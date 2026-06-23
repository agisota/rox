import { EventEmitter } from "node:events";
import { settings } from "@rox/local-db";
import { globalShortcut } from "electron";
import { isExperimentalFeatureUsable } from "lib/trpc/routers/settings/experimental-feature-state";
import { localDb } from "main/lib/local-db";
import { logger } from "main/lib/logger";
import { DEFAULT_PUSH_TO_TALK_ACCELERATOR } from "shared/constants";

/**
 * Desktop push-to-talk global shortcut (`live.pushToTalkDesktop`).
 *
 * Electron `globalShortcut` accelerators are PRESS-only — there is no key-up
 * event — so true hold-to-talk is not achievable at the OS-global level (and
 * the renderer hotkey system only fires while the window is focused). This is
 * therefore a TOGGLE-to-talk binding: each press flips the active voice room's
 * mic mute. The press is forwarded to the renderer (via the `pushToTalk`
 * tRPC subscription), which calls the voice room's `toggleMute` ONLY while a
 * room is connected.
 *
 * The shortcut is registered ONLY while BOTH hold:
 *  - the `live.pushToTalkDesktop` experiment is enabled + usable, and
 *  - a voice room is currently connected (reported by the renderer).
 *
 * This keeps the global accelerator inert (does not steal the chord from the
 * rest of the OS) whenever push-to-talk cannot do anything useful.
 */

const FEATURE_ID = "live.pushToTalkDesktop" as const;

const PRESS_EVENT = "press";

const emitter = new EventEmitter();

/** Whether the renderer currently has a connected voice room. */
let roomConnected = false;
/** The accelerator we actually registered with Electron (for clean teardown). */
let registeredAccelerator: string | null = null;

/** Subscribe to global-shortcut presses. Returns an unsubscribe function. */
export function onPushToTalkPress(listener: () => void): () => void {
	emitter.on(PRESS_EVENT, listener);
	return () => {
		emitter.off(PRESS_EVENT, listener);
	};
}

/**
 * Read the configured global accelerator (native Electron format), falling back
 * to the default when the user has not customized it.
 */
export function getPushToTalkAccelerator(): string {
	try {
		const row = localDb.select().from(settings).get();
		const value = row?.pushToTalkAccelerator?.trim();
		return value && value.length > 0 ? value : DEFAULT_PUSH_TO_TALK_ACCELERATOR;
	} catch (error) {
		logger.error("[push-to-talk] Failed to read accelerator:", error);
		return DEFAULT_PUSH_TO_TALK_ACCELERATOR;
	}
}

/** True only when the shortcut should currently be registered. */
function shouldBeActive(): boolean {
	return roomConnected && isExperimentalFeatureUsable(FEATURE_ID);
}

function unregisterCurrent(): void {
	if (registeredAccelerator === null) return;
	try {
		globalShortcut.unregister(registeredAccelerator);
	} catch (error) {
		logger.error("[push-to-talk] Failed to unregister accelerator:", error);
	}
	registeredAccelerator = null;
}

/**
 * Reconcile the OS-level registration with the desired state. Idempotent: safe
 * to call on every relevant change (connect/disconnect, feature toggle,
 * accelerator change).
 */
export function syncPushToTalkShortcut(): void {
	const desiredAccelerator = getPushToTalkAccelerator();
	const active = shouldBeActive();

	// Already in the desired state — nothing to do.
	if (active && registeredAccelerator === desiredAccelerator) return;
	if (!active && registeredAccelerator === null) return;

	unregisterCurrent();

	if (!active) return;

	try {
		const ok = globalShortcut.register(desiredAccelerator, () => {
			emitter.emit(PRESS_EVENT);
		});
		if (ok) {
			registeredAccelerator = desiredAccelerator;
			logger.info(
				`[push-to-talk] Registered global shortcut: ${desiredAccelerator}`,
			);
		} else {
			logger.warn(
				`[push-to-talk] Could not register global shortcut (already taken?): ${desiredAccelerator}`,
			);
		}
	} catch (error) {
		logger.error("[push-to-talk] Failed to register accelerator:", error);
	}
}

/** Report connected/disconnected voice room state from the renderer. */
export function setPushToTalkRoomConnected(connected: boolean): void {
	if (roomConnected === connected) return;
	roomConnected = connected;
	syncPushToTalkShortcut();
}

/**
 * Persist a new accelerator and re-register if currently active. The value is
 * stored verbatim as a native Electron accelerator string.
 */
export function setPushToTalkAccelerator(accelerator: string): void {
	const normalized = accelerator.trim();
	localDb
		.insert(settings)
		.values({ id: 1, pushToTalkAccelerator: normalized })
		.onConflictDoUpdate({
			target: settings.id,
			set: { pushToTalkAccelerator: normalized },
		})
		.run();
	syncPushToTalkShortcut();
}

/** Release the OS registration (call on quit). */
export function disposePushToTalkShortcut(): void {
	unregisterCurrent();
	roomConnected = false;
}
