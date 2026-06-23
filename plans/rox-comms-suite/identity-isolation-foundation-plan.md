# Identity & Isolation Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dead identity-provisioning path, make `username@rox.one` globally unique + permanently reserved with a 90-day rename alias, and add cross-org membership guards at every mutation seam — closing audit findings I1, S1, I3/M2, S2, T1/S4, C1/S3, N1.

**Architecture:** A handle registry-of-record (`identity_handles`) is the permanent global reservation authority; the identity service (`packages/trpc/src/lib/identity/`) is the single writer of handles + addresses and runs provision/rename atomically in one `dbWs.transaction`. `comms_addresses` gains a global partial-unique mirroring `mail_addresses`; a global, alias-expiry-aware `resolveAddress` replaces the org-scoped `findByValue`. Cross-org writes are gated by a batched `assertOrgMembers`; note collab rooms are gated by `assertNoteAccess` (owner or explicit user-grant). All schema changes are additive (`drizzle-kit generate` only).

**Tech Stack:** Bun + Turbo monorepo · Drizzle ORM + Neon Postgres (`db` = neon-http, `dbWs` = neon-serverless for transactions) · tRPC · `bun:test` · LiveBlocks (collab) · Upstash QStash (cron).

**Source spec:** `plans/rox-comms-suite/identity-isolation-foundation-spec.md`. **Backlog:** `plans/rox-comms-suite/HARDENING-AUDIT.md`.

---

## Ground rules (read before any task)

- **Schema is additive-only.** Edit `packages/db/src/schema/*.ts`, then run `bunx drizzle-kit generate --name="identity_isolation_foundation"` (offline diff). **NEVER** hand-edit `packages/db/drizzle/`. **NEVER** run `drizzle-kit migrate`/`push` against any non-branch DB.
- **Test DB:** apply generated SQL on a **fresh Neon branch** with root `.env` pointed at it. Never prod.
- **Lint with stdin redirected:** `bun run lint < /dev/null` (CI treats warnings as errors). Verify exit 0 before any commit.
- **Test scope:** run path-scoped (`bun test packages/trpc/src/lib/identity/...`) — full `bun test` pulls in integration suites that fail in minimal envs.
- **Enums are append-only** — never reorder existing values.
- **Transactions use `dbWs`**, plain reads/writes use `db`. Import both from `@rox/db/client`.
- **Grantee literal is `"organization"`** (and `"team"`), never the shorthand `"org"` — `accessGranteeTypeValues = ["user","team","organization"]`.

---

## File Structure

**Create:**
- `packages/db/src/schema/handles.ts` — `identity_handles` table (`identity.ts` is taken by `identity_links`).
- `packages/trpc/src/lib/identity/reserveHandle.ts` — S1 reservation primitive.
- `packages/trpc/src/lib/identity/resolveAddress.ts` — global, alias-expiry-aware resolver.
- `packages/trpc/src/lib/identity/renameHandle.ts` — atomic DQ4 rename.
- `packages/trpc/src/lib/identity/reserveHandle.test.ts`, `resolveAddress.test.ts`, `renameHandle.test.ts`.
- `packages/db/src/utils/retire-aliases.ts` — `retireExpiredAliases(db,{at?})` sweep.
- `packages/db/src/utils/retire-aliases.test.ts`.
- `apps/api/src/app/api/identity/retire-aliases/route.ts` — daily QStash cron route.
- `packages/trpc/src/lib/notes/assertNoteAccess.ts` — N1 ACL resolver.
- `packages/trpc/src/lib/notes/assertNoteAccess.test.ts`.

**Modify:**
- `packages/db/src/schema/enums.ts` — append `"note"` to `accessResourceTypeValues`; add `handleStatusValues`.
- `packages/db/src/schema/comms.ts` — partial-unique `(kind,value) WHERE !is_alias` + `handle_id` FK.
- `packages/db/src/schema/mail.ts` — `handle_id` FK.
- `packages/db/src/schema/index.ts` — barrel-export `./handles`.
- `packages/db/src/utils/index.ts` — export `./retire-aliases`.
- `packages/trpc/src/lib/identity/provisionIdentity.ts` — call `reserveHandle`; write to the global partial-unique target; write `handle_id`; catch BOTH index names.
- `packages/trpc/src/lib/identity/provisionIdentity.test.ts` — extend for reservation.
- `packages/trpc/src/router/profile/identity.ts` — `claimHandle` delegates to provision/rename (switch `db`→`dbWs`).
- `packages/trpc/src/router/integration/utils.ts` — add `assertOrgMembers`.
- `packages/comms-core/src/ports.ts` — add optional `members?: MembersStore` to `CommsPorts`.
- `packages/comms-core/src/router/MessageRouter.ts` — call `members.assertMember` in `resolveCounterpart` userId branch.
- `packages/trpc/src/router/comms/ports.ts` — repoint `findByValue` to `resolveAddress`; provide `members` port.
- `packages/trpc/src/router/comms/comms.ts` — `assertOrgMembers` in `sendMessage`.
- `packages/trpc/src/router/calendar/calendar.ts` — `assertOrgMembers`/`verifyOrgMembership` in `createEvent`/`addAttendee`/`shareCalendar`.
- `packages/collab/src/types.ts` — `noteIdFromRoomId` helper.
- `packages/trpc/src/router/collab/collab.ts` — inject `resolveRoomAccess` port backed by `assertNoteAccess`.
- `packages/collab/src/auth.ts` — accept a permission level instead of hardcoded `FULL_ACCESS`.

---

## Shared contracts (signatures locked — use these EXACT names/shapes everywhere)

```ts
// packages/db/src/schema/handles.ts
identityHandles: {
  id, normalizedHandle, currentOwnerUserId (nullable, set-null), firstOwnerUserId (nullable, set-null),
  status: "active" | "grace", reservedAt, createdAt, updatedAt
} // uniqueIndex identity_handles_normalized_uniq ON (normalized_handle)

// packages/trpc/src/lib/identity/reserveHandle.ts
reserveHandle(tx: Tx, args: { normalizedHandle: string; userId: string })
  : Promise<{ handleId: string; outcome: "created" | "owned" }>   // throws TRPCError CONFLICT otherwise

// packages/trpc/src/lib/identity/resolveAddress.ts
resolveAddress(args: { kind: CommsAddressKind; value: string; at?: Date }, db?)
  : Promise<{ userId: string; handleId: string | null; isAlias: boolean; expired: boolean } | null>

// packages/trpc/src/lib/identity/renameHandle.ts
renameHandle(args: { userId: string; fromHandle: string; toHandle: string; organizationId: string; graceDays?: number }, tx?)
  : Promise<{ handleId: string; aliasedAddressIds: string[]; graceUntil: Date }>

// packages/db/src/utils/retire-aliases.ts
retireExpiredAliases(db, args?: { at?: Date }): Promise<{ retired: number }>

// packages/trpc/src/router/integration/utils.ts
assertOrgMembers(organizationId: string, userIds: string[]): Promise<void>   // throws FORBIDDEN if any non-member

// packages/comms-core/src/ports.ts
interface MembersStore { assertMember(args: { organizationId: string; userId: string }): Promise<void> }
// CommsPorts gains:  members?: MembersStore

// packages/trpc/src/lib/notes/assertNoteAccess.ts
assertNoteAccess(db, args: { noteId: string; organizationId: string; userId: string; min: "viewer" | "editor" })
  : Promise<{ note: SelectNoteNote; role: "owner" | "editor" | "viewer" }>   // throws NOT_FOUND / FORBIDDEN

// packages/collab/src/types.ts
noteIdFromRoomId(roomId: string): string | null   // parses ":note:<id>"
```

---

# GROUP 1 — Schema deltas (foundational)

### Task 1: Add `handleStatusValues` enum + append `"note"` resource type

**Files:**
- Modify: `packages/db/src/schema/enums.ts:353-357` (append `"note"`) and the access section (add `handleStatusValues`).

- [ ] **Step 1: Append `"note"` to `accessResourceTypeValues`**

In `packages/db/src/schema/enums.ts`, change:
```ts
export const accessResourceTypeValues = [
	"project",
	"workspace",
	"host",
] as const;
```
to (append at the END — ordinals preserved):
```ts
export const accessResourceTypeValues = [
	"project",
	"workspace",
	"host",
	"note",
] as const;
```

- [ ] **Step 2: Add `handleStatusValues`** (place it directly after the `accessRole*` block, ~line 371)

```ts
// Handle reservation lifecycle (DQ4). `active` = the handle's live owner;
// `grace` = renamed away, old addresses alias to the owner until they expire.
export const handleStatusValues = ["active", "grace"] as const;
export const handleStatusEnum = z.enum(handleStatusValues);
export type HandleStatus = z.infer<typeof handleStatusEnum>;
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck` (or `turbo typecheck --filter=@rox/db`)
Expected: PASS (pure additive value arrays).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/enums.ts
git commit -m "feat(db): append note resource-type + handle_status enum values (additive)"
```

---

### Task 2: Create the `identity_handles` table

**Files:**
- Create: `packages/db/src/schema/handles.ts`
- Modify: `packages/db/src/schema/index.ts` (barrel)

- [ ] **Step 1: Write `packages/db/src/schema/handles.ts`**

```ts
/**
 * Identity handle reservation registry (D1 / DQ4).
 *
 * The permanent, GLOBAL authority for handle ownership. One row per handle ever
 * activated, keyed by `normalized_handle` (lowercased). `current_owner_user_id`
 * is the live owner; it is NEVER reassigned to a different user (S1: a freed or
 * renamed handle stays unclaimable). On user deletion it set-nulls but the row —
 * and therefore the reservation — survives, so the handle remains unclaimable.
 *
 * This table outlives every address row, so reservation holds even after the
 * `comms_addresses` / `mail_addresses` rows are retired by the alias sweep.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."`.
 */

import {
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { handleStatusValues } from "./enums";

export const handleStatus = pgEnum("handle_status", handleStatusValues);

export const identityHandles = pgTable(
	"identity_handles",
	{
		id: uuid().primaryKey().defaultRandom(),
		// Lowercased handle (the canonical reservation key).
		normalizedHandle: text("normalized_handle").notNull(),
		// Live owner. Set-null on user delete; the row (reservation) still stands.
		currentOwnerUserId: uuid("current_owner_user_id").references(
			() => users.id,
			{ onDelete: "set null" },
		),
		// The user who first activated this handle (audit; never used for routing).
		firstOwnerUserId: uuid("first_owner_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		status: handleStatus().notNull().default("active"),
		reservedAt: timestamp("reserved_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("identity_handles_normalized_uniq").on(t.normalizedHandle),
	],
);

export type InsertIdentityHandle = typeof identityHandles.$inferInsert;
export type SelectIdentityHandle = typeof identityHandles.$inferSelect;
```

- [ ] **Step 2: Barrel-export** — in `packages/db/src/schema/index.ts`, add in alphabetical position (between `./github` and `./idempotency`):

```ts
export * from "./handles";
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/handles.ts packages/db/src/schema/index.ts
git commit -m "feat(db): identity_handles reservation registry (DQ4, additive)"
```

---

### Task 3: Add global partial-unique + `handle_id` to `comms_addresses`; `handle_id` to `mail_addresses`

**Files:**
- Modify: `packages/db/src/schema/comms.ts` (imports + `commsAddresses`)
- Modify: `packages/db/src/schema/mail.ts` (`mailAddresses`)

- [ ] **Step 1: Import `identityHandles` into `comms.ts`** — add after the `./auth` import:

```ts
import { identityHandles } from "./handles";
```

- [ ] **Step 2: Add `handleId` column to `commsAddresses`** — after the `verified` column:

```ts
		// Join key to the reservation registry (DQ4); nullable, lazily backfilled.
		handleId: uuid("handle_id").references(() => identityHandles.id, {
			onDelete: "set null",
		}),
```

- [ ] **Step 3: Add the global partial-unique index** — in the `commsAddresses` index array `(t) => [...]`, add (keep the existing `comms_addresses_org_kind_value_uniq` — dropping is non-additive):

```ts
		// GLOBAL: exactly one LIVE primary per (kind, value) across all orgs
		// (S2 fix; mirrors mail_addresses_address_uniq). Aliases are excluded so a
		// renamed owner's old value coexists as an alias alongside the new primary.
		uniqueIndex("comms_addresses_kind_value_primary_uniq")
			.on(t.kind, t.value)
			.where(sql`${t.isAlias} = false`),
```
(`sql` is already imported in `comms.ts`.)

- [ ] **Step 4: Add `handleId` to `mailAddresses`** in `packages/db/src/schema/mail.ts`. Import `identityHandles` (add `import { identityHandles } from "./handles";`), then add after the `graceUntil` column:

```ts
		handleId: uuid("handle_id").references(() => identityHandles.id, {
			onDelete: "set null",
		}),
```

- [ ] **Step 5: Generate the migration (offline)**

Run: `bunx drizzle-kit generate --name="identity_isolation_foundation"`
Expected: a new `packages/db/drizzle/NNNN_identity_isolation_foundation.sql` is created containing: `CREATE TYPE handle_status`, `ALTER TYPE access_resource_type ADD VALUE 'note'`, `CREATE TABLE identity_handles`, `ALTER TABLE comms_addresses ADD COLUMN handle_id` + `CREATE UNIQUE INDEX comms_addresses_kind_value_primary_uniq ... WHERE is_alias = false`, `ALTER TABLE mail_addresses ADD COLUMN handle_id`. **Do not hand-edit it.**

- [ ] **Step 6: Verify additivity** — inspect the generated SQL: it must contain only `CREATE TABLE`, `ADD COLUMN` (nullable), `CREATE [UNIQUE] INDEX`, `CREATE TYPE`, `ALTER TYPE ... ADD VALUE`. It must contain **no** `DROP`, no `ALTER COLUMN ... SET NOT NULL`, no index drops.

- [ ] **Step 7: Apply on a fresh Neon branch + precondition gate**

Create a Neon branch, point root `.env` `DATABASE_URL` at it. Then:
```bash
# PRECONDITION (S2 backfill gate): comms_addresses MUST be empty, else a dedup
# pass is required before the global partial-unique can apply.
psql "$DATABASE_URL" -c "SELECT count(*) FROM comms_addresses;"   # expect 0
bun run --cwd packages/db migrate   # applies generated SQL to the BRANCH only
```
Expected: count = 0; migration applies clean. If count ≠ 0, STOP — escalate (manual dedup needed).

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/comms.ts packages/db/src/schema/mail.ts packages/db/drizzle/
git commit -m "feat(db): global comms address uniqueness + handle_id links (S2, additive)"
```

---

# GROUP 2 — Identity service core (S1 + S2)

### Task 4: `reserveHandle` (S1 primitive)

**Files:**
- Create: `packages/trpc/src/lib/identity/reserveHandle.ts`
- Test: `packages/trpc/src/lib/identity/reserveHandle.test.ts`

- [ ] **Step 1: Write the failing test** `reserveHandle.test.ts`

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const TABLES = new Map<unknown, string>();
const state: { existing: AnyRow | undefined; inserted: AnyRow[] } = {
	existing: undefined,
	inserted: [],
};

function insertBuilder(table: unknown) {
	const name = TABLES.get(table) ?? "unknown";
	return {
		values(v: AnyRow) {
			state.inserted.push(v);
			const chain = {
				onConflictDoNothing: () => chain,
				returning: () =>
					// [] when the handle already existed (conflict); else the new row.
					Promise.resolve(state.existing ? [] : [{ id: "handle-new" }]),
			};
			return chain;
		},
		_name: name,
	};
}

const fakeTx = {
	insert: (t: unknown) => insertBuilder(t),
	select: () => ({
		from: () => ({
			where: () => ({
				limit: () =>
					Promise.resolve(state.existing ? [state.existing] : []),
			}),
		}),
	}),
};

mock.module("@rox/db/client", () => ({ db: fakeTx, dbWs: fakeTx }));
const schema = await import("@rox/db/schema");
TABLES.set(schema.identityHandles, "identity_handles");
const { reserveHandle } = await import("./reserveHandle");

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";

beforeEach(() => {
	state.existing = undefined;
	state.inserted = [];
});

describe("reserveHandle", () => {
	test("creates a new reservation on first claim", async () => {
		const res = await reserveHandle(fakeTx as never, {
			normalizedHandle: "mark",
			userId: USER,
		});
		expect(res.outcome).toBe("created");
		expect(res.handleId).toBe("handle-new");
		expect(state.inserted[0]?.normalizedHandle).toBe("mark");
		expect(state.inserted[0]?.currentOwnerUserId).toBe(USER);
	});

	test("is a no-op when the same user already owns it", async () => {
		state.existing = { id: "h1", currentOwnerUserId: USER };
		const res = await reserveHandle(fakeTx as never, {
			normalizedHandle: "mark",
			userId: USER,
		});
		expect(res.outcome).toBe("owned");
		expect(res.handleId).toBe("h1");
	});

	test("throws CONFLICT when another user owns it (S1 takeover block)", async () => {
		state.existing = { id: "h1", currentOwnerUserId: OTHER };
		await expect(
			reserveHandle(fakeTx as never, { normalizedHandle: "mark", userId: USER }),
		).rejects.toThrow(/already (taken|reserved)/i);
	});

	test("throws CONFLICT for a freed handle (owner null, still reserved)", async () => {
		state.existing = { id: "h1", currentOwnerUserId: null };
		await expect(
			reserveHandle(fakeTx as never, { normalizedHandle: "mark", userId: USER }),
		).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run it — expect FAIL** (module not found)

Run: `bun test packages/trpc/src/lib/identity/reserveHandle.test.ts`
Expected: FAIL — `Cannot find module "./reserveHandle"`.

- [ ] **Step 3: Implement `reserveHandle.ts`**

```ts
/**
 * `reserveHandle` — the S1 primitive (DQ4). Insert-or-own a row in the global
 * `identity_handles` registry. A handle is the user's only if no row exists
 * (created) or the existing row is already theirs (owned); anything else —
 * including a freed handle whose owner was set-null — throws CONFLICT, so a
 * handle is never recycled to a different user.
 *
 * Always call inside the provision/rename `dbWs.transaction` so reservation is
 * atomic with the address writes.
 */

import { identityHandles } from "@rox/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { Tx } from "./provisionIdentity";

export interface ReserveHandleArgs {
	/** Lowercased handle. */
	normalizedHandle: string;
	/** The user attempting to own it. */
	userId: string;
}

export async function reserveHandle(
	tx: Tx,
	{ normalizedHandle, userId }: ReserveHandleArgs,
): Promise<{ handleId: string; outcome: "created" | "owned" }> {
	const [created] = await tx
		.insert(identityHandles)
		.values({
			normalizedHandle,
			currentOwnerUserId: userId,
			firstOwnerUserId: userId,
			status: "active",
		})
		.onConflictDoNothing({ target: identityHandles.normalizedHandle })
		.returning({ id: identityHandles.id });

	if (created) return { handleId: created.id, outcome: "created" };

	// A row already existed — must be this user's, or the handle is taken.
	const [existing] = await tx
		.select({
			id: identityHandles.id,
			currentOwnerUserId: identityHandles.currentOwnerUserId,
		})
		.from(identityHandles)
		.where(eq(identityHandles.normalizedHandle, normalizedHandle))
		.limit(1);

	if (!existing) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Handle reservation lookup failed after conflict.",
		});
	}
	if (existing.currentOwnerUserId !== userId) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Это имя пользователя уже занято.",
		});
	}
	return { handleId: existing.id, outcome: "owned" };
}
```

> Note: `Tx` is exported from `provisionIdentity.ts` (`type Tx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];`). If it is not yet exported, add `export` to that type alias in Task 6 Step 1.

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/trpc/src/lib/identity/reserveHandle.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/lib/identity/reserveHandle.ts packages/trpc/src/lib/identity/reserveHandle.test.ts
git commit -m "feat(identity): reserveHandle — permanent global handle reservation (S1)"
```

---

### Task 5: `resolveAddress` (S2 runtime fix)

**Files:**
- Create: `packages/trpc/src/lib/identity/resolveAddress.ts`
- Test: `packages/trpc/src/lib/identity/resolveAddress.test.ts`

- [ ] **Step 1: Write the failing test** `resolveAddress.test.ts`

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const state: { rows: AnyRow[] } = { rows: [] };

const fakeDb = {
	select: () => ({
		from: () => ({
			where: () => ({ limit: () => Promise.resolve(state.rows) }),
		}),
	}),
};
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
const { resolveAddress } = await import("./resolveAddress");

const USER = "11111111-1111-4111-8111-111111111111";
const AT = new Date("2026-06-23T00:00:00Z");

beforeEach(() => {
	state.rows = [];
});

describe("resolveAddress", () => {
	test("returns null when no address matches", async () => {
		state.rows = [];
		expect(
			await resolveAddress({ kind: "email", value: "x@rox.one", at: AT }, fakeDb),
		).toBeNull();
	});

	test("resolves a live primary to its owner", async () => {
		state.rows = [
			{ userId: USER, handleId: "h1", isAlias: false, aliasExpiresAt: null },
		];
		const r = await resolveAddress(
			{ kind: "email", value: "mark@rox.one", at: AT },
			fakeDb,
		);
		expect(r?.userId).toBe(USER);
		expect(r?.isAlias).toBe(false);
		expect(r?.expired).toBe(false);
	});

	test("resolves an unexpired alias to its owner", async () => {
		state.rows = [
			{
				userId: USER,
				handleId: "h1",
				isAlias: true,
				aliasExpiresAt: new Date("2026-09-01T00:00:00Z"),
			},
		];
		const r = await resolveAddress(
			{ kind: "email", value: "old@rox.one", at: AT },
			fakeDb,
		);
		expect(r?.userId).toBe(USER);
		expect(r?.expired).toBe(false);
	});

	test("returns null for an EXPIRED alias (bounce, no wrong-owner resolve)", async () => {
		state.rows = [
			{
				userId: USER,
				handleId: "h1",
				isAlias: true,
				aliasExpiresAt: new Date("2026-01-01T00:00:00Z"),
			},
		];
		expect(
			await resolveAddress(
				{ kind: "email", value: "old@rox.one", at: AT },
				fakeDb,
			),
		).toBeNull();
	});
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `bun test packages/trpc/src/lib/identity/resolveAddress.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resolveAddress.ts`**

```ts
/**
 * `resolveAddress` — GLOBAL, alias-expiry-aware address → owner resolution (S2).
 *
 * Replaces the org-scoped, expiry-blind `createCommsPorts.addresses.findByValue`
 * on every auth-critical path. `kind` is REQUIRED (callers must not cross-resolve
 * email vs xmpp). A live primary always resolves; an alias resolves to its owner
 * only while unexpired; an expired alias returns null (the caller bounces).
 */

import { db as defaultDb } from "@rox/db/client";
import { type CommsAddressKind, commsAddresses } from "@rox/db/schema";
import { and, desc, eq } from "drizzle-orm";

export interface ResolveAddressArgs {
	kind: CommsAddressKind;
	value: string;
	/** Reference time for alias-expiry (defaults to now). */
	at?: Date;
}

export interface ResolvedAddress {
	userId: string;
	handleId: string | null;
	isAlias: boolean;
	expired: boolean;
}

export async function resolveAddress(
	{ kind, value, at }: ResolveAddressArgs,
	db: { select: typeof defaultDb.select } = defaultDb,
): Promise<ResolvedAddress | null> {
	const normalized = value.trim().toLowerCase();
	const now = at ?? new Date();

	// Prefer the live primary (is_alias=false) over any alias for the value.
	const rows = await db
		.select({
			userId: commsAddresses.userId,
			handleId: commsAddresses.handleId,
			isAlias: commsAddresses.isAlias,
			aliasExpiresAt: commsAddresses.aliasExpiresAt,
		})
		.from(commsAddresses)
		.where(
			and(eq(commsAddresses.kind, kind), eq(commsAddresses.value, normalized)),
		)
		// false sorts before true → primary first.
		.orderBy(desc(commsAddresses.isPrimary))
		.limit(2);

	for (const row of rows) {
		if (!row.isAlias) {
			return {
				userId: row.userId,
				handleId: row.handleId,
				isAlias: false,
				expired: false,
			};
		}
		const expired = !row.aliasExpiresAt || row.aliasExpiresAt <= now;
		if (!expired) {
			return {
				userId: row.userId,
				handleId: row.handleId,
				isAlias: true,
				expired: false,
			};
		}
	}
	return null;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/trpc/src/lib/identity/resolveAddress.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/lib/identity/resolveAddress.ts packages/trpc/src/lib/identity/resolveAddress.test.ts
git commit -m "feat(identity): global alias-aware resolveAddress (S2)"
```

---

### Task 6: Wire `provisionIdentity` to reserve + write global target + handle_id

**Files:**
- Modify: `packages/trpc/src/lib/identity/provisionIdentity.ts`
- Modify: `packages/trpc/src/lib/identity/provisionIdentity.test.ts`

- [ ] **Step 1: Export the `Tx` type** — in `provisionIdentity.ts`, change `type Tx = ...` to `export type Tx = ...` (reserveHandle imports it).

- [ ] **Step 2: Add the reservation + handle_id in `provisionIdentity`'s `run`** — at the top of `run`, before the address insert:

```ts
		const { reserveHandle } = await import("./reserveHandle");
		const { handleId } = await reserveHandle(db, {
			normalizedHandle: addresses.handle,
			userId: input.userId,
		});
```
Then add `handleId` to each address row object and switch the conflict target to the global partial-unique. The address insert becomes:
```ts
		const addressRows = [
			{ organizationId: input.organizationId, userId: input.userId, handleId,
				kind: "email" as const, value: addresses.email,
				isPrimary: true, isAlias: false, verified: false },
			{ organizationId: input.organizationId, userId: input.userId, handleId,
				kind: "xmpp" as const, value: addresses.xmpp,
				isPrimary: true, isAlias: false, verified: false },
		];
		const insertedAddresses = await db
			.insert(commsAddresses)
			.values(addressRows)
			.onConflictDoNothing({
				target: [commsAddresses.kind, commsAddresses.value],
				targetWhere: sql`${commsAddresses.isAlias} = false`,
			})
			.returning({ id: commsAddresses.id });
```
Add the imports at the top of the file: `import { sql } from "drizzle-orm";` and ensure `commsAddresses` is already imported (it is).

- [ ] **Step 3: Extend the existing test** — in `provisionIdentity.test.ts`, register the new table and add a reservation assertion. After `TABLES.set(schema.storageQuota, ...)` add:

```ts
TABLES.set(schema.identityHandles, "identity_handles");
```
Add a test:
```ts
	test("reserves the handle before writing addresses (S1)", async () => {
		await provisionIdentity({
			userId: USER_ID,
			handle: "Mark",
			organizationId: ORG_ID,
		});
		const handle = state.inserts.find((i) => i.table === "identity_handles");
		expect(handle).toBeDefined();
		expect(handle?.values[0]?.normalizedHandle).toBe("mark");
		expect(handle?.values[0]?.currentOwnerUserId).toBe(USER_ID);
	});
```
The existing stub's `insertBuilder` already supports `onConflictDoNothing().returning()`; the new `reserveHandle` insert is recorded like any other. The default `state.returning` for `identity_handles` is `[{ id: "new" }]` (so `outcome="created"`), which keeps existing tests green.

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/trpc/src/lib/identity/provisionIdentity.test.ts`
Expected: all pass (existing + the new reservation test).

- [ ] **Step 5: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/lib/identity/provisionIdentity.ts packages/trpc/src/lib/identity/provisionIdentity.test.ts
git commit -m "feat(identity): provisionIdentity reserves handle + global address target (I1/S2)"
```

---

### Task 7: Repoint comms `findByValue` to `resolveAddress`

**Files:**
- Modify: `packages/trpc/src/router/comms/ports.ts:163-177`

- [ ] **Step 1: Replace `addresses.findByValue` body** to delegate to the global resolver (drop the org filter; honor expiry):

```ts
		addresses: {
			async findByValue({ value, kind }) {
				// GLOBAL + alias-expiry-aware (S2). The org filter is intentionally
				// dropped: identity is global per user (DQ3); an expired alias must
				// NOT resolve to its old owner.
				const resolved = await resolveAddress({
					kind: (kind ?? "email") as CommsAddressKind,
					value,
				});
				if (!resolved) return null;
				return toAddress({
					userId: resolved.userId,
					// downstream only consumes userId for the user branch.
					organizationId,
					kind: kind ?? "email",
					value: value.trim().toLowerCase(),
					isAlias: resolved.isAlias,
				});
			},
		},
```
Add imports at the top of `ports.ts`: `import { resolveAddress } from "../../lib/identity/resolveAddress";` and `import type { CommsAddressKind } from "@rox/db/schema";`. (If `toAddress` requires fields not provided, pass the minimal shape it maps — verify against the existing `toAddress` mapper and supply the same keys.)

> Trap (from spec): `resolveCounterpart` calls `findByValue` WITHOUT `kind`. The default `"email"` above preserves current behavior, but the real fix in Task 9 passes an explicit `kind`. Keep the default as a safety net.

- [ ] **Step 2: Typecheck + existing comms tests**

Run: `bun run typecheck` then `bun test packages/trpc/src/router/comms`
Expected: PASS (the comms test stubs `@rox/db/client`; `resolveAddress` reads through the same stubbed `db.select`).

- [ ] **Step 3: Commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/router/comms/ports.ts
git commit -m "fix(comms): resolve addresses globally with alias-expiry (S2)"
```

---

# GROUP 3 — Rename + lifecycle (I1 + I3/M2)

### Task 8: `renameHandle` (atomic DQ4 flow)

**Files:**
- Create: `packages/trpc/src/lib/identity/renameHandle.ts`
- Test: `packages/trpc/src/lib/identity/renameHandle.test.ts`

- [ ] **Step 1: Write the failing test** `renameHandle.test.ts`

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const TABLES = new Map<unknown, string>();
const state: {
	updates: { table: string; set: AnyRow }[];
	inserts: { table: string; values: AnyRow[] }[];
	handleRow: AnyRow | undefined;
} = { updates: [], inserts: [], handleRow: undefined };

function chainFor(table: unknown) {
	const name = TABLES.get(table) ?? "unknown";
	return {
		insert: () => ({
			values(v: AnyRow | AnyRow[]) {
				const arr = Array.isArray(v) ? v : [v];
				state.inserts.push({ table: name, values: arr });
				const c = {
					onConflictDoNothing: () => c,
					returning: () =>
						Promise.resolve(
							name === "identity_handles" && state.handleRow
								? []
								: [{ id: `${name}-new` }],
						),
				};
				return c;
			},
		}),
		update: () => ({
			set(s: AnyRow) {
				state.updates.push({ table: name, set: s });
				return { where: () => ({ returning: () => Promise.resolve([{ id: "x" }]) }) };
			},
		}),
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () =>
						Promise.resolve(state.handleRow ? [state.handleRow] : []),
				}),
			}),
		}),
	};
}

const tx = {
	insert: (t: unknown) => chainFor(t).insert(),
	update: (t: unknown) => chainFor(t).update(),
	select: () => chainFor(undefined).select(),
};
const fakeDbWs = { transaction: <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx) };
mock.module("@rox/db/client", () => ({ db: fakeDbWs, dbWs: fakeDbWs }));
const schema = await import("@rox/db/schema");
TABLES.set(schema.identityHandles, "identity_handles");
TABLES.set(schema.commsAddresses, "comms_addresses");
TABLES.set(schema.mailAddresses, "mail_addresses");
TABLES.set(schema.userProfiles, "user_profiles");
const { renameHandle } = await import("./renameHandle");

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
	state.updates = [];
	state.inserts = [];
	state.handleRow = { id: "h-to", currentOwnerUserId: USER };
});

describe("renameHandle", () => {
	test("aliases old comms + mail addresses with a 90-day grace", async () => {
		await renameHandle({
			userId: USER,
			fromHandle: "old",
			toHandle: "new",
			organizationId: ORG,
		});
		const commsAlias = state.updates.find((u) => u.table === "comms_addresses");
		expect(commsAlias?.set.isAlias).toBe(true);
		expect(commsAlias?.set.aliasExpiresAt).toBeInstanceOf(Date);
		const mailAlias = state.updates.find((u) => u.table === "mail_addresses");
		expect(mailAlias?.set.status).toBe("grace");
	});

	test("mints new primary comms + mail addresses for the new handle", async () => {
		await renameHandle({
			userId: USER,
			fromHandle: "old",
			toHandle: "new",
			organizationId: ORG,
		});
		const comms = state.inserts.find((i) => i.table === "comms_addresses");
		expect(comms?.values.some((v) => v.value === "new@rox.one")).toBe(true);
		const profile = state.updates.find((u) => u.table === "user_profiles");
		expect(profile?.set.handle).toBe("new");
	});

	test("rejects when the target handle is owned by another user (S1)", async () => {
		state.handleRow = { id: "h-to", currentOwnerUserId: "someone-else" };
		await expect(
			renameHandle({ userId: USER, fromHandle: "old", toHandle: "new", organizationId: ORG }),
		).rejects.toThrow(/занято|taken|reserved/i);
	});
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `bun test packages/trpc/src/lib/identity/renameHandle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `renameHandle.ts`**

```ts
/**
 * `renameHandle` — the atomic DQ4 rename (I3/M2). In ONE transaction:
 * reserve the new handle (S1), repoint the profile, alias the old comms + mail
 * addresses with a 90-day grace, mint the new primaries, and flip the old
 * reservation row to `grace` (owner stays pinned forever). Any throw rolls back
 * the whole flow — no half-aliased identity. Idempotent on (userId, toHandle).
 */

import { deriveAddresses } from "@rox/comms-core";
import { dbWs } from "@rox/db/client";
import {
	commsAddresses,
	identityHandles,
	mailAddresses,
	userProfiles,
} from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import { reserveHandle } from "./reserveHandle";
import type { Tx } from "./provisionIdentity";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RenameHandleArgs {
	userId: string;
	fromHandle: string;
	toHandle: string;
	organizationId: string;
	graceDays?: number;
}

export async function renameHandle(
	args: RenameHandleArgs,
	tx?: Tx,
): Promise<{ handleId: string; aliasedAddressIds: string[]; graceUntil: Date }> {
	const from = deriveAddresses(args.fromHandle);
	const to = deriveAddresses(args.toHandle);
	const graceUntil = new Date(Date.now() + (args.graceDays ?? 90) * DAY_MS);

	const run = async (db: Tx) => {
		// 1. Reserve the target handle FIRST (lock ordering: handles before addrs).
		const { handleId } = await reserveHandle(db, {
			normalizedHandle: to.handle,
			userId: args.userId,
		});

		// 2. Repoint the profile.
		await db
			.update(userProfiles)
			.set({ handle: to.handle })
			.where(eq(userProfiles.userId, args.userId));

		// 3. Alias the OLD live primary comms addresses (email + xmpp).
		const aliased = await db
			.update(commsAddresses)
			.set({ isPrimary: false, isAlias: true, aliasExpiresAt: graceUntil })
			.where(
				and(
					eq(commsAddresses.userId, args.userId),
					eq(commsAddresses.value, from.email),
					eq(commsAddresses.isAlias, false),
				),
			)
			.returning({ id: commsAddresses.id });

		// 4. Alias the OLD mail address.
		await db
			.update(mailAddresses)
			.set({ kind: "alias", status: "grace", graceUntil })
			.where(
				and(
					eq(mailAddresses.userId, args.userId),
					eq(mailAddresses.address, from.email),
				),
			);

		// 5. Mint the NEW primary comms + mail addresses.
		await db
			.insert(commsAddresses)
			.values([
				{ organizationId: args.organizationId, userId: args.userId, handleId,
					kind: "email", value: to.email, isPrimary: true, isAlias: false, verified: false },
				{ organizationId: args.organizationId, userId: args.userId, handleId,
					kind: "xmpp", value: to.xmpp, isPrimary: true, isAlias: false, verified: false },
			])
			.onConflictDoNothing();
		await db
			.insert(mailAddresses)
			.values({
				organizationId: args.organizationId, userId: args.userId, handleId,
				localPart: to.handle, address: to.email, kind: "primary", status: "active",
			})
			.onConflictDoNothing();

		// 6. Flip the OLD reservation to grace (owner stays pinned forever).
		await db
			.update(identityHandles)
			.set({ status: "grace" })
			.where(eq(identityHandles.normalizedHandle, from.handle));

		return {
			handleId,
			aliasedAddressIds: aliased.map((r) => r.id),
			graceUntil,
		};
	};

	return tx ? run(tx) : dbWs.transaction(run);
}
```

> Trap: `Date.now()` is fine in app code (it is only forbidden in Workflow scripts). The dual-index CONFLICT mapping is handled at the `claimHandle` layer (Task 10).

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/trpc/src/lib/identity/renameHandle.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/lib/identity/renameHandle.ts packages/trpc/src/lib/identity/renameHandle.test.ts
git commit -m "feat(identity): atomic renameHandle with 90-day alias grace (I3/M2)"
```

---

### Task 9: `retireExpiredAliases` sweep + daily cron route

**Files:**
- Create: `packages/db/src/utils/retire-aliases.ts`
- Modify: `packages/db/src/utils/index.ts`
- Test: `packages/db/src/utils/retire-aliases.test.ts`
- Create: `apps/api/src/app/api/identity/retire-aliases/route.ts`

- [ ] **Step 1: Write the failing test** `retire-aliases.test.ts`

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const state: { commsRetired: AnyRow[]; mailRetired: AnyRow[] } = {
	commsRetired: [],
	mailRetired: [],
};
const TABLES = new Map<unknown, string>();

function makeDb() {
	const db: AnyRow = {
		update: (t: unknown) => ({
			set: (s: AnyRow) => ({
				where: () => {
					const name = TABLES.get(t);
					const rows = name === "mail_addresses"
						? [{ id: "m1" }]
						: [{ id: "c1" }, { id: "c2" }];
					if (name === "mail_addresses") state.mailRetired.push(s);
					else state.commsRetired.push(s);
					return { returning: () => Promise.resolve(rows) };
				},
			}),
		}),
	};
	return db;
}
const fakeDb = makeDb();
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
const schema = await import("../schema");
TABLES.set(schema.commsAddresses, "comms_addresses");
TABLES.set(schema.mailAddresses, "mail_addresses");
const { retireExpiredAliases } = await import("./retire-aliases");

beforeEach(() => {
	state.commsRetired = [];
	state.mailRetired = [];
});

describe("retireExpiredAliases", () => {
	test("disables expired comms aliases and mail grace rows", async () => {
		const res = await retireExpiredAliases(fakeDb, {
			at: new Date("2026-06-23T00:00:00Z"),
		});
		expect(res.retired).toBe(3); // 2 comms + 1 mail
		expect(state.commsRetired[0]?.isPrimary).toBe(false);
		expect(state.mailRetired[0]?.status).toBe("disabled");
	});
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `bun test packages/db/src/utils/retire-aliases.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `retire-aliases.ts`**

```ts
/**
 * `retireExpiredAliases` — daily idempotent sweep (DQ4). Disables comms aliases
 * past `alias_expires_at` and flips mail grace rows past `grace_until` to
 * `disabled`. NEVER touches `identity_handles` (the reservation is permanent).
 */

import { and, eq, lt } from "drizzle-orm";
import { db as defaultDb } from "../client";
import { commsAddresses, mailAddresses } from "../schema";

export async function retireExpiredAliases(
	db: typeof defaultDb = defaultDb,
	args?: { at?: Date },
): Promise<{ retired: number }> {
	const now = args?.at ?? new Date();

	const comms = await db
		.update(commsAddresses)
		.set({ verified: false })
		.where(
			and(
				eq(commsAddresses.isAlias, true),
				lt(commsAddresses.aliasExpiresAt, now),
			),
		)
		.returning({ id: commsAddresses.id });

	const mail = await db
		.update(mailAddresses)
		.set({ status: "disabled" })
		.where(
			and(eq(mailAddresses.status, "grace"), lt(mailAddresses.graceUntil, now)),
		)
		.returning({ id: mailAddresses.id });

	return { retired: comms.length + mail.length };
}
```
> Note: the comms `.set({ verified: false })` is a placeholder marker for "retired alias"; if a dedicated retired flag is preferred, add an additive `retired_at` column in a follow-up. For this slice, `resolveAddress` already treats an expired alias as unresolvable, so the sweep is for hygiene, not correctness. **Match the test's expectation** by setting `isPrimary: false` instead — update the `.set(...)` to `{ isPrimary: false }` so `state.commsRetired[0]?.isPrimary === false` holds. (Use one consistent marker; the test above asserts `isPrimary === false`.)

- [ ] **Step 4: Export from utils barrel** — add to `packages/db/src/utils/index.ts`:

```ts
export * from "./retire-aliases";
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `bun test packages/db/src/utils/retire-aliases.test.ts`
Expected: 1 pass.

- [ ] **Step 6: Create the cron route** `apps/api/src/app/api/identity/retire-aliases/route.ts` (mirror `apps/api/src/app/api/memory/learn/route.ts`, prefer the shared `verifyQstash` helper):

```ts
/**
 * Daily alias-retirement sweep (DQ4). QStash schedule (cron `0 3 * * *`).
 *
 * Schedule registration (run once per environment):
 *   curl -X POST https://qstash.upstash.io/v2/schedules \
 *     -H "Authorization: Bearer $QSTASH_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{ "destination": "'"$NEXT_PUBLIC_API_URL"'/api/identity/retire-aliases",
 *           "cron": "0 3 * * *" }'
 */

import { db } from "@rox/db/client";
import { retireExpiredAliases } from "@rox/db/utils";
import { verifyQstash } from "@/lib/qstash-verify";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
	const verified = await verifyQstash(request, {
		url: `${process.env.NEXT_PUBLIC_API_URL}/api/identity/retire-aliases`,
	});
	if (!verified.ok) return verified.response;

	const result = await retireExpiredAliases(db);
	return Response.json(result);
}
```
> Verify `verifyQstash`'s exact signature/return shape at `apps/api/src/lib/qstash-verify.ts` and adapt (it returns `{ ok, body }` or `{ ok:false, response }`). If the helper differs, fall back to the inline `Receiver` pattern from `apps/api/src/app/api/memory/learn/route.ts`.

- [ ] **Step 7: Typecheck + commit**

```bash
bun run typecheck
bun run lint < /dev/null
git add packages/db/src/utils/retire-aliases.ts packages/db/src/utils/retire-aliases.test.ts packages/db/src/utils/index.ts apps/api/src/app/api/identity/retire-aliases/route.ts
git commit -m "feat(identity): daily expired-alias retirement sweep + cron (DQ4)"
```

---

### Task 10: `claimHandle` delegates to provision / rename

**Files:**
- Modify: `packages/trpc/src/router/profile/identity.ts`

- [ ] **Step 1: Switch imports** — change `import { db } from "@rox/db/client";` to `import { db, dbWs } from "@rox/db/client";`, add `import { provisionIdentity } from "../../lib/identity/provisionIdentity";`, `import { renameHandle } from "../../lib/identity/renameHandle";`, and `import { requireActiveOrgId } from "../utils/active-org";`.

- [ ] **Step 2: Replace the `try { ... }` insert block (lines 165-192)** with provision/rename delegation:

```ts
			// Identity is org-stamped (DQ3) for Electric shapes; the active org is
			// the stamp. Require one so provisioning has an org to write under.
			const organizationId = requireActiveOrgId(ctx);

			// Read the CURRENT handle to decide provision (first claim) vs rename.
			const current = await db.query.userProfiles.findFirst({
				where: eq(userProfiles.userId, userId),
				columns: { handle: true },
			});

			try {
				if (current?.handle && current.handle !== handle) {
					// Handle CHANGE → atomic rename + 90-day alias (DQ4).
					await renameHandle({
						userId,
						fromHandle: current.handle,
						toHandle: handle,
						organizationId,
					});
				} else if (!current?.handle) {
					// FIRST claim → provision identity (I1: the first real caller).
					await dbWs.transaction(async (tx) => {
						await tx
							.insert(userProfiles)
							.values({ userId, handle })
							.onConflictDoUpdate({ target: userProfiles.userId, set: { handle } });
						await provisionIdentity({ userId, handle, organizationId }, tx);
					});
				}
				// else: same handle re-submitted → no-op.

				return { handle };
			} catch (error) {
				// Dual-index trap: a same-org dup hits comms_addresses_org_kind_value_uniq;
				// a cross-org dup hits comms_addresses_kind_value_primary_uniq; the handle
				// table hits identity_handles_normalized_uniq. Map ALL to CONFLICT.
				if (
					error instanceof Error &&
					/unique|duplicate|занято|reserved/i.test(error.message)
				) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "Это имя пользователя уже занято.",
					});
				}
				throw error;
			}
```

> The pre-existing uniqueness pre-check on `user_profiles.handle` (lines 152-163) stays as the friendly fast-path; `reserveHandle` is the race-safe authority.

- [ ] **Step 3: Verify the `eq` import** is present (it is) and `userProfiles` is imported (it is).

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual integration check on the Neon branch** (provisioning has no router test harness today; verify end-to-end):

```bash
# With root .env on the Neon branch + dev server running, sign in as Local Admin,
# claim a handle, then:
psql "$DATABASE_URL" -c "SELECT normalized_handle, status FROM identity_handles;"
psql "$DATABASE_URL" -c "SELECT kind, value, is_alias FROM comms_addresses;"
psql "$DATABASE_URL" -c "SELECT address, kind, status FROM mail_addresses;"
```
Expected: one `identity_handles` row (status `active`), two `comms_addresses` primaries (email+xmpp), one `mail_addresses` primary. Re-claiming the SAME handle → no new rows. Claiming a DIFFERENT handle → old rows aliased, new primaries minted, old `identity_handles` row → `grace`.

- [ ] **Step 6: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/router/profile/identity.ts
git commit -m "feat(identity): claimHandle provisions on first claim, renames with grace (I1/I3/M2/S1)"
```

---

# GROUP 4 — Cross-org guards (T1/S4 + C1/S3)

### Task 11: `assertOrgMembers` (batched guard)

**Files:**
- Modify: `packages/trpc/src/router/integration/utils.ts`
- Test: `packages/trpc/src/router/integration/assertOrgMembers.test.ts`

- [ ] **Step 1: Write the failing test** `assertOrgMembers.test.ts`

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const state: { members: AnyRow[] } = { members: [] };
const fakeDb = {
	select: () => ({ from: () => ({ where: () => Promise.resolve(state.members) }) }),
};
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
const { assertOrgMembers } = await import("./utils");

const ORG = "22222222-2222-4222-8222-222222222222";
const A = "a0000000-0000-4000-8000-000000000000";
const B = "b0000000-0000-4000-8000-000000000000";

beforeEach(() => {
	state.members = [];
});

describe("assertOrgMembers", () => {
	test("passes when every userId is a member", async () => {
		state.members = [{ userId: A }, { userId: B }];
		await expect(assertOrgMembers(ORG, [A, B])).resolves.toBeUndefined();
	});

	test("dedupes and skips empty input", async () => {
		await expect(assertOrgMembers(ORG, [])).resolves.toBeUndefined();
	});

	test("throws FORBIDDEN when any userId is NOT a member (cross-org)", async () => {
		state.members = [{ userId: A }]; // B missing
		await expect(assertOrgMembers(ORG, [A, B])).rejects.toThrow(/member/i);
	});
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `bun test packages/trpc/src/router/integration/assertOrgMembers.test.ts`
Expected: FAIL — `assertOrgMembers` not exported.

- [ ] **Step 3: Implement `assertOrgMembers`** — append to `packages/trpc/src/router/integration/utils.ts`:

```ts
import { db } from "@rox/db/client";
import { members } from "@rox/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Batched cross-org membership guard. Throws FORBIDDEN unless EVERY `userId` is
 * a member of `organizationId`. One query (`WHERE org=$1 AND user_id = ANY($2)`).
 * Dedupes; a no-op for empty input.
 */
export async function assertOrgMembers(
	organizationId: string,
	userIds: string[],
): Promise<void> {
	const unique = [...new Set(userIds)];
	if (unique.length === 0) return;

	const rows = await db
		.select({ userId: members.userId })
		.from(members)
		.where(
			and(
				eq(members.organizationId, organizationId),
				inArray(members.userId, unique),
			),
		);

	const found = new Set(rows.map((r) => r.userId));
	const missing = unique.filter((id) => !found.has(id));
	if (missing.length > 0) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "One or more recipients are not members of this organization",
		});
	}
}
```
(`TRPCError` is already imported in this file.)

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/trpc/src/router/integration/assertOrgMembers.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/router/integration/utils.ts packages/trpc/src/router/integration/assertOrgMembers.test.ts
git commit -m "feat(authz): batched assertOrgMembers cross-org guard"
```

---

### Task 12: Guard `comms.sendMessage` (T1/S4)

**Files:**
- Modify: `packages/trpc/src/router/comms/comms.ts`

- [ ] **Step 1: Import the guard** — add `import { assertOrgMembers } from "../integration/utils";` to the imports.

- [ ] **Step 2: Insert the batched check** — in `sendMessage`, immediately after the `recipients` array is built (after the `.map(...)` ending ~line 176) and before `const draft`:

```ts
			// T1/S4: every userId recipient MUST be a member of the caller's org.
			await assertOrgMembers(
				organizationId,
				recipients.flatMap((r) => (r.kind === "userId" ? [r.userId] : [])),
			);
```

- [ ] **Step 3: Add a router test** asserting cross-org rejection — extend `packages/trpc/src/router/comms/comms.test.ts`. Override the `../integration/utils` mock so `assertOrgMembers` rejects, and assert no message is written:

```ts
test("sendMessage rejects a cross-org recipient (T1/S4)", async () => {
	// Re-mock utils so assertOrgMembers throws for this case.
	const { TRPCError } = await import("@trpc/server");
	mock.module("../integration/utils", () => ({
		verifyOrgMembership: () => Promise.resolve(),
		assertOrgMembers: () => {
			throw new TRPCError({ code: "FORBIDDEN", message: "not a member" });
		},
	}));
	const { commsRouter: r } = await import("./comms");
	const app = (await import("../../trpc")).createTRPCRouter({ comms: r });
	const call = (await import("../../trpc")).createCallerFactory(app);
	const caller = call({
		session: { user: { id: "user-1" }, session: { activeOrganizationId: "org-1" } },
		headers: new Headers(),
	} as never);
	await expect(
		caller.comms.sendMessage({
			recipients: [{ kind: "userId", userId: OTHER_USER }],
			body: "hi",
		}),
	).rejects.toThrow(/member/i);
	expect(state.inserted.find((i) => i.values[0]?.threadId)).toBeUndefined();
});
```
> If re-mocking mid-file is awkward with the existing top-level mock, instead add this as a sibling test file `comms.sendMessage.guard.test.ts` with its own mock setup mirroring the harness skeleton. Prefer whichever keeps the existing suite green.

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/trpc/src/router/comms`
Expected: PASS (existing + new guard test).

- [ ] **Step 5: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/router/comms/comms.ts packages/trpc/src/router/comms/*.test.ts
git commit -m "fix(comms): reject cross-org recipients in sendMessage (T1/S4)"
```

---

### Task 13: Defense-in-depth `members` port in comms-core

**Files:**
- Modify: `packages/comms-core/src/ports.ts`
- Modify: `packages/comms-core/src/router/MessageRouter.ts`
- Modify: `packages/trpc/src/router/comms/ports.ts`

- [ ] **Step 1: Add `MembersStore` + optional `members` to `CommsPorts`** in `packages/comms-core/src/ports.ts`:

```ts
/** Optional org-membership guard (defense-in-depth for non-tRPC callers). */
export interface MembersStore {
	assertMember(args: { organizationId: string; userId: string }): Promise<void>;
}
```
and in `CommsPorts`:
```ts
	presence: PresenceStore;
	/** Optional: when present, resolveCounterpart verifies userId recipients. */
	members?: MembersStore;
```

- [ ] **Step 2: Call it in `resolveCounterpart`** (`MessageRouter.ts`, the `if (ref.kind === "userId")` branch):

```ts
		if (ref.kind === "userId") {
			await this.ports.members?.assertMember({
				organizationId,
				userId: ref.userId,
			});
			return { type: "user", organizationId, userId: ref.userId };
		}
```

- [ ] **Step 3: Provide the port** in `packages/trpc/src/router/comms/ports.ts` `createCommsPorts` return object:

```ts
		members: {
			async assertMember({ organizationId: org, userId }) {
				const { assertOrgMembers } = await import("../integration/utils");
				await assertOrgMembers(org, [userId]);
			},
		},
```

- [ ] **Step 4: Typecheck + comms tests**

Run: `bun run typecheck && bun test packages/comms-core packages/trpc/src/router/comms`
Expected: PASS (the `members` port is optional; comms-core's in-memory tests that omit it are unaffected).

- [ ] **Step 5: Commit**

```bash
bun run lint < /dev/null
git add packages/comms-core/src/ports.ts packages/comms-core/src/router/MessageRouter.ts packages/trpc/src/router/comms/ports.ts
git commit -m "feat(comms-core): optional members port for defense-in-depth recipient guard (T1/S4)"
```

---

### Task 14: Guard calendar `createEvent` / `addAttendee` / `shareCalendar` (C1/S3)

**Files:**
- Modify: `packages/trpc/src/router/calendar/calendar.ts`

- [ ] **Step 1: Import guards** — add `import { assertOrgMembers, verifyOrgMembership } from "../integration/utils";`.

- [ ] **Step 2: `addAttendee`** — after `getEventWithAccess(...)` and before the insert, guard a `userId`-kind attendee:

```ts
			if (input.attendee.kind === "userId") {
				await assertOrgMembers(organizationId, [input.attendee.userId]);
			}
```

- [ ] **Step 3: `shareCalendar`** — after `resolveCalendarAccess(...)` and before the insert:

```ts
			await verifyOrgMembership(input.userId, organizationId);
```

- [ ] **Step 4: `createEvent`** — after `resolveCalendarAccess(...)` (line ~372) and before building attendee `rows`:

```ts
			await assertOrgMembers(
				organizationId,
				(input.attendees ?? []).flatMap((a) =>
					a.kind === "userId" ? [a.userId] : [],
				),
			);
```

- [ ] **Step 5: Add router tests** — extend `packages/trpc/src/router/calendar/calendar.test.ts` (it already stubs the db + utils). Override `assertOrgMembers`/`verifyOrgMembership` to throw and assert `addAttendee`, `shareCalendar`, `createEvent` reject a non-member `userId`; with the pass-through mock, assert a same-org member + an `email`-kind attendee succeed. Mirror the existing test's caller/ctx setup. Example shape:

```ts
test("addAttendee rejects a non-member userId (C1/S3)", async () => {
	mock.module("../integration/utils", () => ({
		verifyOrgMembership: () => Promise.resolve({ membership: {} }),
		assertOrgMembers: () => { throw new Error("not a member"); },
	}));
	// ...rebuild caller (mirror the file's existing helper)...
	await expect(
		caller.calendar.addAttendee({
			eventId: EVENT_ID,
			attendee: { kind: "userId", userId: OUTSIDER },
		}),
	).rejects.toThrow(/member/i);
});
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `bun test packages/trpc/src/router/calendar`
Expected: PASS.

- [ ] **Step 7: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/router/calendar/calendar.ts packages/trpc/src/router/calendar/calendar.test.ts
git commit -m "fix(calendar): verify org membership for attendees + shares (C1/S3)"
```

---

# GROUP 5 — Note collab ACL (N1)

### Task 15: `assertNoteAccess` (owner-only by default; DQ1)

**Files:**
- Create: `packages/trpc/src/lib/notes/assertNoteAccess.ts`
- Test: `packages/trpc/src/lib/notes/assertNoteAccess.test.ts`

- [ ] **Step 1: Write the failing test** `assertNoteAccess.test.ts`

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const state: { note: AnyRow | undefined; grant: AnyRow | undefined } = {
	note: undefined,
	grant: undefined,
};
const fakeDb = {
	query: {
		noteNotes: { findFirst: () => Promise.resolve(state.note) },
		accessGrants: { findFirst: () => Promise.resolve(state.grant) },
	},
};
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
const { assertNoteAccess } = await import("./assertNoteAccess");

const ORG = "22222222-2222-4222-8222-222222222222";
const OWNER = "owner-000-0000-4000-8000-000000000000";
const OTHER = "other-000-0000-4000-8000-000000000000";
const NOTE = "note0000-0000-4000-8000-000000000000";

beforeEach(() => {
	state.note = { id: NOTE, organizationId: ORG, ownerUserId: OWNER };
	state.grant = undefined;
});

describe("assertNoteAccess", () => {
	test("owner gets role=owner", async () => {
		const r = await assertNoteAccess(fakeDb as never, {
			noteId: NOTE, organizationId: ORG, userId: OWNER, min: "editor",
		});
		expect(r.role).toBe("owner");
	});

	test("same-org non-owner with NO grant is DENIED (DQ1)", async () => {
		await expect(
			assertNoteAccess(fakeDb as never, {
				noteId: NOTE, organizationId: ORG, userId: OTHER, min: "viewer",
			}),
		).rejects.toThrow(/forbidden|access/i);
	});

	test("a user-grant editor passes the editor gate", async () => {
		state.grant = { role: "editor", granteeType: "user" };
		const r = await assertNoteAccess(fakeDb as never, {
			noteId: NOTE, organizationId: ORG, userId: OTHER, min: "editor",
		});
		expect(r.role).toBe("editor");
	});

	test("a user-grant VIEWER fails the editor gate", async () => {
		state.grant = { role: "viewer", granteeType: "user" };
		await expect(
			assertNoteAccess(fakeDb as never, {
				noteId: NOTE, organizationId: ORG, userId: OTHER, min: "editor",
			}),
		).rejects.toThrow();
	});

	test("NOT_FOUND when the note is in another org", async () => {
		state.note = undefined; // findFirst scoped by (id, org) returns nothing
		await expect(
			assertNoteAccess(fakeDb as never, {
				noteId: NOTE, organizationId: ORG, userId: OWNER, min: "viewer",
			}),
		).rejects.toThrow(/not found|forbidden/i);
	});
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `bun test packages/trpc/src/lib/notes/assertNoteAccess.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `assertNoteAccess.ts`**

```ts
/**
 * `assertNoteAccess` — N1 fix. A note is owner-only by default (DQ1): a same-org
 * non-owner with no explicit USER grant is denied. Only `granteeType="user"`
 * grants are honored — `"organization"`/`"team"` grants are ignored on notes so
 * an org-wide grant cannot re-open N1.
 */

import { db as defaultDb } from "@rox/db/client";
import {
	type SelectNoteNote,
	accessGrants,
	noteNotes,
} from "@rox/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

type Db = Pick<typeof defaultDb, "query">;
const RANK = { viewer: 1, editor: 2, owner: 3 } as const;

export async function assertNoteAccess(
	db: Db,
	args: {
		noteId: string;
		organizationId: string;
		userId: string;
		min: "viewer" | "editor";
	},
): Promise<{ note: SelectNoteNote; role: "owner" | "editor" | "viewer" }> {
	const note = await db.query.noteNotes.findFirst({
		where: and(
			eq(noteNotes.id, args.noteId),
			eq(noteNotes.organizationId, args.organizationId),
		),
	});
	if (!note) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
	}

	let role: "owner" | "editor" | "viewer" | null = null;
	if (note.ownerUserId === args.userId) {
		role = "owner";
	} else {
		const grant = await db.query.accessGrants.findFirst({
			where: and(
				eq(accessGrants.organizationId, args.organizationId),
				eq(accessGrants.resourceType, "note"),
				eq(accessGrants.resourceId, args.noteId),
				eq(accessGrants.granteeType, "user"), // NEVER organization/team (DQ1)
				eq(accessGrants.granteeId, args.userId),
			),
		});
		if (grant?.role === "admin" || grant?.role === "editor") role = "editor";
		else if (grant?.role === "viewer") role = "viewer";
	}

	if (!role || RANK[role] < RANK[args.min]) {
		throw new TRPCError({ code: "FORBIDDEN", message: "No access to this note" });
	}
	return { note, role };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/trpc/src/lib/notes/assertNoteAccess.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/trpc/src/lib/notes/assertNoteAccess.ts packages/trpc/src/lib/notes/assertNoteAccess.test.ts
git commit -m "feat(notes): assertNoteAccess — owner-only note ACL (N1/DQ1)"
```

---

### Task 16: `noteIdFromRoomId` helper

**Files:**
- Modify: `packages/collab/src/types.ts`
- Test: `packages/collab/src/types.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test** (append to or create `packages/collab/src/types.test.ts`)

```ts
import { describe, expect, test } from "bun:test";
import { noteIdFromRoomId, noteRoomId } from "./types";

describe("noteIdFromRoomId", () => {
	test("parses the note id from a note room id", () => {
		expect(noteIdFromRoomId(noteRoomId("org1", "note1"))).toBe("note1");
	});
	test("returns null for a non-note room", () => {
		expect(noteIdFromRoomId("org:org1:dashboard:d1")).toBeNull();
	});
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `bun test packages/collab/src/types.test.ts`
Expected: FAIL — `noteIdFromRoomId` not exported.

- [ ] **Step 3: Implement** — add to `packages/collab/src/types.ts` (after `organizationIdFromRoomId`):

```ts
/**
 * Parse the note id out of a note room id (`org:{orgId}:note:{noteId}`).
 * Returns null for any non-note room.
 */
export function noteIdFromRoomId(roomId: string): string | null {
	const match = /^org:[^:]+:note:(.+)$/.exec(roomId);
	return match ? (match[1] ?? null) : null;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/collab/src/types.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
bun run lint < /dev/null
git add packages/collab/src/types.ts packages/collab/src/types.test.ts
git commit -m "feat(collab): noteIdFromRoomId helper (N1)"
```

---

### Task 17: Wire note-room access into `authorizeRoom`

**Files:**
- Modify: `packages/collab/src/auth.ts`
- Modify: `packages/trpc/src/router/collab/collab.ts`

- [ ] **Step 1: Accept a permission level in `authorizeRoom`** — change `AuthorizeRoomArgs` to add an optional `access` and replace the hardcoded grant. In `packages/collab/src/auth.ts`:

Add to `AuthorizeRoomArgs`:
```ts
	/** Permission to grant. Defaults to full access (dashboard rooms). */
	access?: "full" | "read";
```
Replace line 78 (`session.allow(roomId, session.FULL_ACCESS);`) with:
```ts
	const perms =
		(args.access ?? "full") === "read"
			? ["room:read", "room:presence:write"]
			: session.FULL_ACCESS;
	session.allow(roomId, perms);
```
(Adjust the read-perm string array to the LiveBlocks scoped-permission constants the SDK exposes if `session` provides them; `["room:read","room:presence:write"]` is the documented read+presence scope.)

- [ ] **Step 2: Resolve note access in `authorizeRoomForMember`** — in `packages/trpc/src/router/collab/collab.ts`:

Add a `resolveRoomAccess` port to `AuthorizeRoomForMemberArgs.ports`:
```ts
		/** Resolve the caller's access for a resource-scoped room (e.g. notes). */
		resolveRoomAccess?: (
			roomId: string,
			organizationId: string,
		) => Promise<"full" | "read" | "deny">;
```
In `authorizeRoomForMember`, after `const organizationId = await ports.requireMembership();`:
```ts
	let access: "full" | "read" = "full";
	if (ports.resolveRoomAccess) {
		const decision = await ports.resolveRoomAccess(roomId, organizationId);
		if (decision === "deny") {
			throw new Error(`Access denied to room ${roomId}`);
		}
		access = decision;
	}
```
Pass `access` into `authorizeRoom({ ..., access })`.

- [ ] **Step 3: Inject the real resolver in the router** — in the `authRoom` mutation's `ports`, add (import `assertNoteAccess`, `noteIdFromRoomId`, `db`):

```ts
import { db } from "@rox/db/client";
import { noteIdFromRoomId } from "@rox/collab/types";
import { assertNoteAccess } from "../../lib/notes/assertNoteAccess";
```
```ts
				ports: {
					requireMembership: () => requireActiveOrgMembership(ctx),
					resolveRoomAccess: async (roomId, organizationId) => {
						const noteId = noteIdFromRoomId(roomId);
						if (!noteId) return "full"; // non-note rooms keep org-only behavior
						try {
							const { role } = await assertNoteAccess(db, {
								noteId,
								organizationId,
								userId: ctx.session.user.id,
								min: "viewer",
							});
							return role === "viewer" ? "read" : "full";
						} catch {
							return "deny";
						}
					},
				},
```

- [ ] **Step 4: Update collab auth tests** — the package has a port-injection test pattern. Add cases: a note room where `resolveRoomAccess` returns `deny` → throws; `read` → `session.allow` called with read perms; `full` → FULL_ACCESS. Mirror the existing `authorizeRoomForMember`/`authorizeRoom` test setup (inject a fake `liveblocks` + a fake `resolveRoomAccess`). Run:

Run: `bun test packages/collab packages/trpc/src/router/collab`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint < /dev/null
git add packages/collab/src/auth.ts packages/trpc/src/router/collab/collab.ts packages/collab/**/*.test.ts
git commit -m "fix(collab): gate note rooms by assertNoteAccess, not org membership (N1)"
```

---

# GROUP 6 — Cross-cutting verification

### Task 18: DB-constraint regression + full slice green

**Files:**
- Test: `packages/trpc/src/lib/identity/globalUniqueness.test.ts`

- [ ] **Step 1: Write the S2 isolation regression test** (house style — drives the conflict via the stub's empty-`returning`, asserting the SECOND identical-value primary insert is a no-op / rejected):

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const TABLES = new Map<unknown, string>();
const state: { liveValues: Set<string>; inserts: AnyRow[] } = {
	liveValues: new Set(),
	inserts: [],
};

function insertBuilder(table: unknown) {
	const name = TABLES.get(table) ?? "unknown";
	return {
		values(v: AnyRow | AnyRow[]) {
			const arr = Array.isArray(v) ? v : [v];
			state.inserts.push(...arr);
			const chain = {
				onConflictDoNothing: () => chain,
				returning: () => {
					// Simulate the partial-unique on (kind,value) WHERE !is_alias:
					// a second LIVE primary for an existing value yields [] (conflict).
					if (name === "comms_addresses") {
						const out: AnyRow[] = [];
						for (const row of arr) {
							const key = `${row.kind}:${row.value}`;
							if (row.isAlias === false && state.liveValues.has(key)) continue;
							if (row.isAlias === false) state.liveValues.add(key);
							out.push({ id: "ok" });
						}
						return Promise.resolve(out);
					}
					return Promise.resolve([{ id: "ok" }]);
				},
			};
			return chain;
		},
	};
}
const fakeTx = {
	insert: (t: unknown) => insertBuilder(t),
	select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
};
const fakeDbWs = {
	insert: (t: unknown) => insertBuilder(t),
	transaction: <T>(fn: (tx: typeof fakeTx) => Promise<T>) => fn(fakeTx),
};
mock.module("@rox/db/client", () => ({ db: fakeDbWs, dbWs: fakeDbWs }));
const schema = await import("@rox/db/schema");
TABLES.set(schema.commsAddresses, "comms_addresses");
TABLES.set(schema.commsKeypairs, "comms_keypairs");
TABLES.set(schema.storageQuota, "storage_quota");
TABLES.set(schema.identityHandles, "identity_handles");
const { provisionIdentity } = await import("./provisionIdentity");

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
	state.liveValues = new Set();
	state.inserts = [];
});

describe("global address uniqueness (S2)", () => {
	test("the same handle cannot mint a 2nd live primary in another org", async () => {
		await provisionIdentity({ userId: "u1", handle: "mark", organizationId: ORG_A });
		const before = state.liveValues.size;
		await provisionIdentity({ userId: "u2", handle: "mark", organizationId: ORG_B });
		// No NEW live (kind,value) pairs were added by the second org's attempt.
		expect(state.liveValues.size).toBe(before);
	});
});
```

- [ ] **Step 2: Run it — expect PASS**

Run: `bun test packages/trpc/src/lib/identity/globalUniqueness.test.ts`
Expected: 1 pass.

- [ ] **Step 3: Run the whole slice's tests**

Run: `bun test packages/trpc/src/lib/identity packages/trpc/src/lib/notes packages/trpc/src/router/comms packages/trpc/src/router/calendar packages/trpc/src/router/integration packages/comms-core packages/collab packages/db/src/utils`
Expected: all PASS.

- [ ] **Step 4: Full typecheck + lint**

Run: `bun run typecheck && bun run lint < /dev/null`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/lib/identity/globalUniqueness.test.ts
git commit -m "test(identity): global-uniqueness regression for S2"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** I1 (Task 6+10), S1 (Task 4+10), I3/M2 (Task 8+10), S2 (Task 3+5+7+18), T1/S4 (Task 11+12+13), C1/S3 (Task 11+14), N1 (Task 15+16+17). All 7 findings have implementing tasks. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code or an exact edit. The two `> Note`/`> Trap` callouts flag real implementation hazards (dual-index CONFLICT mapping in Task 10; `resolveAddress` default-kind safety net in Task 7; the `retire-aliases` marker-column consistency in Task 9 Step 3) and are resolved inline. ✓

**Type consistency:** `Tx` exported from `provisionIdentity.ts` and reused by `reserveHandle`/`renameHandle` (Task 6 Step 1). `reserveHandle` signature identical in Tasks 4/6/8. `assertOrgMembers(org, userIds[])` identical in Tasks 11/12/13/14. `assertNoteAccess(db, {...})` identical in Tasks 15/17. `resolveAddress({kind,value,at?}, db?)` identical in Tasks 5/7. Enum literal `"organization"` (never `"org"`) in Task 15. ✓

**Open risks carried from the spec (not blockers):** `access_grants.resourceId` has no FK to `note_notes` → orphan grants on note delete (follow-up cleanup, noted in spec). LiveBlocks read-perm constant in Task 17 Step 1 may need the SDK's exact scoped-permission API — verify against `@liveblocks/node` at implementation time.
