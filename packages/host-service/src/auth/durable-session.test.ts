import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type DurableSession,
	type DurableSessionChange,
	DurableSessionStore,
} from "./durable-session";

let dir: string;
let sessionPath: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "rox-durable-session-"));
	sessionPath = join(dir, "durable-session.enc");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const SESSION: DurableSession = {
	token: "sess_tok_abc123",
	expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
	userId: "user_1",
	activeOrganizationId: "org_1",
};

describe("DurableSessionStore", () => {
	test("persists a session across store instances (web -> desktop inheritance)", () => {
		// Surface A (e.g. the web handoff landing in the desktop bridge) writes.
		const writer = new DurableSessionStore(sessionPath);
		writer.write(SESSION);

		// Surface B (e.g. the host-service serving another client) constructs a
		// fresh store against the same path and inherits the session.
		const reader = new DurableSessionStore(sessionPath);
		const inherited = reader.read();

		expect(inherited).not.toBeNull();
		expect(inherited?.token).toBe(SESSION.token);
		expect(inherited?.userId).toBe("user_1");
		expect(inherited?.activeOrganizationId).toBe("org_1");
	});

	test("encrypts at rest — the token is not stored in plaintext", () => {
		const store = new DurableSessionStore(sessionPath);
		store.write(SESSION);
		const raw = require("node:fs").readFileSync(sessionPath);
		expect(raw.includes(Buffer.from(SESSION.token))).toBe(false);
	});

	test("isLive reflects expiry", () => {
		const store = new DurableSessionStore(sessionPath);
		expect(store.isLive()).toBe(false); // nothing persisted yet

		store.write(SESSION);
		expect(store.isLive()).toBe(true);

		store.write({
			...SESSION,
			expiresAt: new Date(Date.now() - 1000).toISOString(),
		});
		expect(store.isLive()).toBe(false);
	});

	test("clear removes the shared session for every surface (sign-out)", () => {
		const a = new DurableSessionStore(sessionPath);
		a.write(SESSION);
		expect(new DurableSessionStore(sessionPath).read()).not.toBeNull();

		a.clear();
		expect(new DurableSessionStore(sessionPath).read()).toBeNull();
	});

	test("broadcasts updates and clears to subscribers (cross-surface sync)", () => {
		const store = new DurableSessionStore(sessionPath);
		const changes: DurableSessionChange[] = [];
		const unsubscribe = store.subscribe((c) => changes.push(c));

		store.write(SESSION);
		store.clear();
		unsubscribe();
		store.write(SESSION); // ignored after unsubscribe

		expect(changes).toHaveLength(2);
		expect(changes[0]).toEqual({ type: "updated", session: SESSION });
		expect(changes[1]).toEqual({ type: "cleared" });
	});

	test("read returns null for a corrupt or partial file", () => {
		const store = new DurableSessionStore(sessionPath);
		require("node:fs").writeFileSync(sessionPath, Buffer.from("not-encrypted"));
		expect(store.read()).toBeNull();
		expect(store.isLive()).toBe(false);
	});
});
