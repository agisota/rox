import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../src/db";
import { hostSettings } from "../../src/db/schema";
import { getHostLocalFirstCreate } from "../../src/trpc/router/settings/host-settings";
import { createTestHost } from "../helpers/createTestHost";

/** Raw nullable column read (null = never chosen), bypassing getter coalescing. */
function rawLocalFirstCreate(db: HostDb): boolean | null {
	return (
		db.select().from(hostSettings).where(eq(hostSettings.id, 1)).get()
			?.localFirstCreate ?? null
	);
}

/**
 * Enable-by-default startup seed, wired through the REAL `createApp` boot.
 * Proves the seed runs on host-service startup (not just as a standalone fn),
 * is idempotent across a real handle dispose+reopen on the SAME on-disk db, and
 * never overrides a user's explicit kill-switch.
 */
describe("local-first enable-by-default startup seed (via createApp)", () => {
	let cleanups: Array<() => void> = [];
	afterEach(() => {
		for (const c of cleanups) c();
		cleanups = [];
	});

	test("(a) first launch with no prior setting → after startup, localFirstCreate reads ON", async () => {
		// `seedDefaults: true` is what `serve.ts` passes on a real boot.
		const host = await createTestHost({ seedDefaults: true });
		cleanups.push(() => {
			void host.dispose();
		});

		// `createApp` already ran the seed during boot. A real build now reads ON.
		expect(getHostLocalFirstCreate(host.db)).toBe(true);
		// The column holds an explicit `true`, not the null "never chosen" state.
		expect(rawLocalFirstCreate(host.db)).toBe(true);

		// And it is observable through the public settings router the renderer uses.
		const settings = await host.trpc.settings.localFirst.get.query();
		expect(settings.localFirstCreate).toBe(true);
		// The advertised DEFAULT stays OFF — only the seeded value flipped behavior.
		expect(settings.defaultLocalFirstCreate).toBe(false);
	});

	test("(b) a user-set OFF persists across a restart (the seed does NOT re-enable it)", async () => {
		// One real on-disk sqlite file shared across two boots (quit + relaunch).
		const dataDir = mkdtempSync(join(tmpdir(), "host-seed-killswitch-"));
		cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
		const dbPath = join(dataDir, "host.db");

		// ── Launch #1 ──────────────────────────────────────────────────────────
		// Boot seeds ON (first launch). The user then flips the kill-switch OFF
		// via the same router the renderer calls.
		const host1 = await createTestHost({
			dbPath,
			keepData: true,
			seedDefaults: true,
		});
		expect(getHostLocalFirstCreate(host1.db)).toBe(true); // seeded ON on boot
		await host1.trpc.settings.localFirst.set.mutate({
			localFirstCreate: false,
		});
		expect(getHostLocalFirstCreate(host1.db)).toBe(false);
		expect(rawLocalFirstCreate(host1.db)).toBe(false); // explicit false on disk
		await host1.dispose();

		// ── Launch #2: SAME file ────────────────────────────────────────────────
		// Boot runs the seed again; it must see the explicit `false` and leave it.
		const host2 = await createTestHost({
			dbPath,
			keepData: true,
			seedDefaults: true,
		});
		cleanups.push(() => {
			void host2.dispose();
		});

		expect(getHostLocalFirstCreate(host2.db)).toBe(false); // OFF survived restart
		expect(rawLocalFirstCreate(host2.db)).toBe(false); // still explicit false
		const settings = await host2.trpc.settings.localFirst.get.query();
		expect(settings.localFirstCreate).toBe(false);
	});

	test("(c) a user-set ON stays ON across a restart (seed is a no-op on non-null)", async () => {
		const dataDir = mkdtempSync(join(tmpdir(), "host-seed-on-"));
		cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
		const dbPath = join(dataDir, "host.db");

		const host1 = await createTestHost({
			dbPath,
			keepData: true,
			seedDefaults: true,
		});
		// Explicitly set ON (idempotent with the seed, but proves an explicit
		// user ON is preserved exactly like an explicit OFF).
		await host1.trpc.settings.localFirst.set.mutate({
			localFirstCreate: true,
		});
		expect(rawLocalFirstCreate(host1.db)).toBe(true);
		await host1.dispose();

		const host2 = await createTestHost({
			dbPath,
			keepData: true,
			seedDefaults: true,
		});
		cleanups.push(() => {
			void host2.dispose();
		});
		expect(getHostLocalFirstCreate(host2.db)).toBe(true);
		expect(rawLocalFirstCreate(host2.db)).toBe(true);
	});
});
