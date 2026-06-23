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
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "./provisionIdentity";
import { reserveHandle } from "./reserveHandle";

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
): Promise<{
	handleId: string;
	aliasedAddressIds: string[];
	graceUntil: Date;
}> {
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

		// 5. Mint the NEW primary comms + mail addresses. The comms insert targets
		//    the GLOBAL partial-unique `(kind, value) WHERE is_alias = false`
		//    (mirrors provisionIdentity) so a re-run is a no-op rather than an error.
		await db
			.insert(commsAddresses)
			.values([
				{
					organizationId: args.organizationId,
					userId: args.userId,
					handleId,
					kind: "email",
					value: to.email,
					isPrimary: true,
					isAlias: false,
					verified: false,
				},
				{
					organizationId: args.organizationId,
					userId: args.userId,
					handleId,
					kind: "xmpp",
					value: to.xmpp,
					isPrimary: true,
					isAlias: false,
					verified: false,
				},
			])
			.onConflictDoNothing({
				target: [commsAddresses.kind, commsAddresses.value],
				where: sql`${commsAddresses.isAlias} = false`,
			});
		await db
			.insert(mailAddresses)
			.values({
				organizationId: args.organizationId,
				userId: args.userId,
				handleId,
				localPart: to.handle,
				address: to.email,
				kind: "primary",
				status: "active",
			})
			.onConflictDoNothing({ target: mailAddresses.address });

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
