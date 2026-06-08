import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
} from "node:crypto";
import { EventEmitter } from "node:events";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getMachineId } from "@rox/shared/host-info";

/**
 * Durable, cross-surface auth session.
 *
 * This is the single source of truth for "who is signed in on this host",
 * shared between the WebUI (app.rox.one, delivered into the desktop via the
 * deep-link / local-callback handoff) and the desktop app (apps/desktop).
 *
 * Both surfaces resolve the SAME on-disk location (`$ROX_HOME_DIR/durable-session.enc`)
 * and the SAME machine-derived encryption key, so a registration or sign-in
 * performed on one surface is inherited by the other on the next read — and a
 * sign-out clears it for every surface. The desktop auth bridge
 * (`apps/desktop/.../auth/utils/auth-functions.ts`) write-throughs to this
 * store on `saveToken` and reads through it on `loadToken`; the host-service,
 * which runs locally and on remote hosts, treats this store as the canonical
 * session it serves to any connected client.
 *
 * The session payload is a Better Auth session token (a row in the `auth.sessions`
 * table) plus the org/user context needed to hydrate a client without a round
 * trip. The token is opaque; possession of it is sufficient to act as the user,
 * which is why the file is encrypted at rest with a machine-bound key and written
 * with 0600 permissions inside the 0700 Rox home directory.
 */
export interface DurableSession {
	/** Better Auth session token (bearer). */
	token: string;
	/** ISO-8601 expiry timestamp. */
	expiresAt: string;
	/** Owning user id, when known, for fast client hydration. */
	userId?: string;
	/** Active organization the session was scoped to, when known. */
	activeOrganizationId?: string | null;
}

export type DurableSessionChange =
	| { type: "updated"; session: DurableSession }
	| { type: "cleared" };

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MIN_ENCRYPTED_LENGTH = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;

const ROX_HOME_DIR_MODE = 0o700;
const ROX_SENSITIVE_FILE_MODE = 0o600;

function deriveKey(salt: Buffer): Buffer {
	return scryptSync(getMachineId(), salt, KEY_LENGTH);
}

/**
 * Encrypt with AES-256-GCM under a machine-derived key.
 * Layout: salt (16) + iv (12) + authTag (16) + ciphertext.
 * Mirrors the desktop crypto-storage scheme so both surfaces interop.
 */
function encrypt(plaintext: string): Buffer {
	const salt = randomBytes(SALT_LENGTH);
	const key = deriveKey(salt);
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return Buffer.concat([salt, iv, authTag, encrypted]);
}

function decrypt(data: Buffer): string {
	if (data.length < MIN_ENCRYPTED_LENGTH) {
		throw new Error("Encrypted durable session too short");
	}

	const salt = data.subarray(0, SALT_LENGTH);
	const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
	const authTag = data.subarray(
		SALT_LENGTH + IV_LENGTH,
		SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
	);
	const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

	const key = deriveKey(salt);
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}

/**
 * Resolve the Rox home directory the same way the desktop main process and the
 * host-service daemon do, so every surface lands on one shared directory.
 */
export function resolveRoxHomeDir(): string {
	return process.env.ROX_HOME_DIR || join(homedir(), ".rox");
}

/** Canonical path of the shared, cross-surface session file. */
export function defaultDurableSessionPath(): string {
	return join(resolveRoxHomeDir(), "durable-session.enc");
}

/**
 * File-backed, encrypted store for the shared session. Constructing two stores
 * against the same path (e.g. one in the desktop bridge, one in the
 * host-service) yields a single shared session: writes from one are inherited
 * by reads from the other.
 */
export class DurableSessionStore {
	readonly path: string;
	readonly events = new EventEmitter();

	constructor(path: string = defaultDurableSessionPath()) {
		this.path = path;
	}

	/** Read the persisted session, or null if absent/unreadable. */
	read(): DurableSession | null {
		try {
			if (!existsSync(this.path)) return null;
			const json = decrypt(readFileSync(this.path));
			const parsed = JSON.parse(json) as DurableSession;
			if (!parsed?.token || !parsed?.expiresAt) return null;
			return parsed;
		} catch {
			return null;
		}
	}

	/** True when a non-expired session is persisted. */
	isLive(now: number = Date.now()): boolean {
		const session = this.read();
		return !!session && new Date(session.expiresAt).getTime() > now;
	}

	/** Persist (and broadcast) the session, making it inheritable by all surfaces. */
	write(session: DurableSession): void {
		mkdirSync(dirname(this.path), {
			recursive: true,
			mode: ROX_HOME_DIR_MODE,
		});
		writeFileSync(this.path, encrypt(JSON.stringify(session)), {
			mode: ROX_SENSITIVE_FILE_MODE,
		});
		this.events.emit("change", {
			type: "updated",
			session,
		} satisfies DurableSessionChange);
	}

	/** Remove the shared session (sign-out), broadcasting to subscribers. */
	clear(): void {
		try {
			rmSync(this.path, { force: true });
		} catch {
			// Best-effort: a missing file is already "cleared".
		}
		this.events.emit("change", {
			type: "cleared",
		} satisfies DurableSessionChange);
	}

	/** Subscribe to session updates/clears; returns an unsubscribe fn. */
	subscribe(listener: (change: DurableSessionChange) => void): () => void {
		this.events.on("change", listener);
		return () => {
			this.events.off("change", listener);
		};
	}
}

let sharedStore: DurableSessionStore | null = null;

/**
 * Process-wide singleton pointing at the canonical shared session path. Use
 * this from both the host-service and the desktop bridge so every surface on a
 * host reads and writes the same session.
 */
export function getDurableSessionStore(): DurableSessionStore {
	if (!sharedStore) {
		sharedStore = new DurableSessionStore();
	}
	return sharedStore;
}
