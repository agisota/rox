import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { join } from "node:path";
import { getDurableSessionStore } from "@rox/host-service/auth";
import { ROX_HOME_DIR } from "main/lib/app-environment";
import { PROTOCOL_SCHEME } from "shared/constants";
import { decrypt, encrypt } from "./crypto-storage";

interface StoredAuth {
	token: string;
	expiresAt: string;
}

export const TOKEN_FILE = join(ROX_HOME_DIR, "auth-token.enc");
export const stateStore = new Map<string, number>();

/**
 * Shared, cross-surface session store. Mirroring the desktop token here makes
 * the session inheritable by any other surface on this host (the host-service,
 * and by extension the WebUI handoff), and reading from it lets the desktop
 * adopt a session that was established elsewhere on the host. See
 * `@rox/host-service/auth` for the full propagation model.
 */
const durableSession = getDurableSessionStore();

/**
 * Event emitter for auth-related events.
 * Used by tRPC subscription to notify renderer of token changes.
 *
 * Events:
 * - "token-saved": { token, expiresAt } - New token saved (OAuth callback)
 * - "token-cleared": (no data) - Token deleted (sign-out)
 */
export const authEvents = new EventEmitter();

/**
 * Load token from encrypted disk storage.
 */
export async function loadToken(): Promise<{
	token: string | null;
	expiresAt: string | null;
}> {
	try {
		const data = decrypt(await fs.readFile(TOKEN_FILE));
		const parsed: StoredAuth = JSON.parse(data);
		return { token: parsed.token, expiresAt: parsed.expiresAt };
	} catch {
		// No desktop-local token: inherit a session established on another
		// surface of this host (e.g. the WebUI handoff or host-service).
		try {
			const shared = durableSession.read();
			if (shared?.token && shared?.expiresAt) {
				return { token: shared.token, expiresAt: shared.expiresAt };
			}
		} catch {
			// Best-effort inheritance; fall through to "signed out".
		}
		return { token: null, expiresAt: null };
	}
}

/**
 * Persist token to encrypted disk storage and notify subscribers.
 */
export async function saveToken({
	token,
	expiresAt,
}: {
	token: string;
	expiresAt: string;
}): Promise<void> {
	const storedAuth: StoredAuth = { token, expiresAt };
	await fs.writeFile(TOKEN_FILE, encrypt(JSON.stringify(storedAuth)));
	// Write-through to the shared store so the session is inherited by the
	// host-service and any other surface on this host.
	try {
		durableSession.write({ token, expiresAt });
	} catch (err) {
		console.warn("[auth] failed to mirror token to durable session", err);
	}
	authEvents.emit("token-saved", { token, expiresAt });
}

/**
 * Clear the persisted desktop token AND the shared durable session, signing the
 * user out across every surface on this host. Notifies subscribers.
 */
export async function clearToken(): Promise<void> {
	await fs.unlink(TOKEN_FILE).catch(() => {});
	try {
		durableSession.clear();
	} catch (err) {
		console.warn("[auth] failed to clear durable session", err);
	}
	authEvents.emit("token-cleared");
}

/**
 * Handle OAuth callback from deep link.
 * Validates CSRF state and saves token.
 */
export async function handleAuthCallback(params: {
	token: string;
	expiresAt: string;
	state: string;
}): Promise<{ success: boolean; error?: string }> {
	if (!stateStore.has(params.state)) {
		return { success: false, error: "Invalid or expired auth session" };
	}
	stateStore.delete(params.state);

	await saveToken({ token: params.token, expiresAt: params.expiresAt });

	return { success: true };
}

/**
 * Parse and validate auth deep link URL.
 */
export function parseAuthDeepLink(
	url: string,
): { token: string; expiresAt: string; state: string } | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return null;
		if (parsed.host !== "auth" || parsed.pathname !== "/callback") return null;

		const token = parsed.searchParams.get("token");
		const expiresAt = parsed.searchParams.get("expiresAt");
		const state = parsed.searchParams.get("state");
		if (!token || !expiresAt || !state) return null;
		return { token, expiresAt, state };
	} catch {
		return null;
	}
}
