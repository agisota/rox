/**
 * Drizzle-backed {@link MailIngestDb} — the real persistence wiring for the
 * inbound ingest (D3 P3). The pure {@link ingestInboundMail} orchestration never
 * imports a db client; this is where its narrow port becomes Drizzle statements
 * against the `mail_*` tables and the D1 `comms_*` unified inbox.
 *
 * The D1 emit (step 8) bridges D3 into the unified inbox: it finds-or-creates a
 * `comms_threads` row keyed by the email Message-ID and inserts a
 * `comms_messages` row with `transport='email'`, so an inbound email lands in
 * the same cross-transport inbox the in-app DMs use — D3 feeds D1 without owning
 * its thread spine. `comms_messages` carries `organization_id` + a NOT-NULL
 * `thread_id`; we use a lightweight thread keyed by the message dedup string.
 *
 * M1: an EXTERNAL (non-rox) sender is attributed to a D6 contact node — the emit
 * reuses the SAME `graphService.resolveIdentity` find-or-create the comms-core
 * `resolveContact` port wraps, so the message + thread gain a stable, org-scoped
 * `author_contact_entity_id` instead of staying unauthored. An internal rox→rox
 * email keeps its `author_user_id` attribution unchanged.
 */

import { deriveDedupKey } from "@rox/comms-core";
import { db, dbWs } from "@rox/db/client";
import {
	commsAddresses,
	commsMessages,
	commsParticipants,
	commsThreads,
	mailAddresses,
	mailAttachments,
	mailMessages,
	mailThreads,
} from "@rox/db/schema";
import { publishCommsMessage } from "@rox/shared/comms-events";
import { graphService } from "@rox/trpc/graph";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { MailIngestDb } from "./ingest";

type AnyRow = Record<string, unknown>;

/**
 * Find-or-create the D1 thread for a mail dedup key (FIX 2). The
 * `comms_threads_org_dedup_uniq` partial unique index is the backstop: a
 * concurrent emit that slips past the SELECT collapses on the INSERT
 * (`onConflictDoNothing`) and a re-SELECT then resolves the winner's id — so two
 * recipients racing the same conversation share ONE thread instead of forking.
 * Mirrors the message-insert dedup pattern already used below.
 */
async function findOrCreateCommsThread(
	db: typeof import("@rox/db/client").db,
	args: { organizationId: string; dedupKey: string; subject: string | null },
): Promise<string> {
	const [existing] = await db
		.select({ id: commsThreads.id })
		.from(commsThreads)
		.where(
			and(
				eq(commsThreads.organizationId, args.organizationId),
				eq(commsThreads.dedupKey, args.dedupKey),
			),
		)
		.limit(1);
	if (existing) {
		await db
			.update(commsThreads)
			.set({ lastMessageAt: new Date() })
			.where(eq(commsThreads.id, existing.id));
		return existing.id;
	}

	const [thread] = await db
		.insert(commsThreads)
		.values({
			organizationId: args.organizationId,
			subject: args.subject,
			dedupKey: args.dedupKey,
			lastMessageAt: new Date(),
		})
		.onConflictDoNothing({
			target: [commsThreads.organizationId, commsThreads.dedupKey],
		})
		.returning({ id: commsThreads.id });
	if (thread) return thread.id;

	// Lost the insert race — the concurrent winner's row now exists; re-select it.
	const [winner] = await db
		.select({ id: commsThreads.id })
		.from(commsThreads)
		.where(
			and(
				eq(commsThreads.organizationId, args.organizationId),
				eq(commsThreads.dedupKey, args.dedupKey),
			),
		)
		.limit(1);
	if (!winner) throw new Error("Failed to find-or-create comms thread");
	return winner.id;
}

/**
 * Insert `comms_participants` rows for the given rox users (FIX 1), de-duped and
 * idempotent on the `(thread_id, user_id)` partial unique. Null/blank ids are
 * skipped (an external sender is NOT a rox participant — it resolves to a contact
 * node elsewhere). No-op when there are no resolvable users.
 */
async function ensureCommsParticipants(
	db: typeof import("@rox/db/client").db,
	args: {
		organizationId: string;
		threadId: string;
		userIds: ReadonlyArray<string | null | undefined>;
	},
): Promise<void> {
	const userIds = [
		...new Set(args.userIds.filter((id): id is string => Boolean(id))),
	];
	if (userIds.length === 0) return;
	await db
		.insert(commsParticipants)
		.values(
			userIds.map((userId) => ({
				organizationId: args.organizationId,
				threadId: args.threadId,
				userId,
				role: "member" as const,
			})),
		)
		.onConflictDoNothing();
}

/**
 * M1: resolve an EXTERNAL (non-rox) email sender to a D6 contact node, reusing the
 * SAME `graphService.resolveIdentity` find-or-create the comms-core `resolveContact`
 * port wraps (`packages/trpc/src/router/comms/ports.ts`). Identity is keyed on
 * `(org, kind, value)` via `identity_links`, so the same external address in the
 * same org always resolves to the SAME contact — no duplicate node for a repeat
 * sender. Mirrors the port's kind mapping (`email` → `email`) and its
 * `dbWs.transaction` wrapper (the graph service is the only writer of contacts).
 *
 * Best-effort: a resolver failure returns `null` so the email still lands in the
 * unified inbox (unauthored) instead of 500-ing the inbound worker — the previous
 * behavior for every external sender.
 */
async function resolveExternalContact(args: {
	organizationId: string;
	emailAddress: string;
}): Promise<string | null> {
	try {
		const { contact } = await dbWs.transaction((tx) =>
			graphService.resolveIdentity(tx, {
				orgId: args.organizationId,
				kind: "email",
				value: args.emailAddress,
			}),
		);
		return contact.id;
	} catch {
		return null;
	}
}

/**
 * M1: attach an external contact node as a `comms_participants` row (FK-less
 * `contact_entity_id`, no `user_id`) so a pure-email thread surfaces its external
 * counterpart alongside the mailbox owner.
 *
 * DEDUP (no migration): `onConflictDoNothing` CANNOT dedup a contact row — the
 * only partial unique on `comms_participants` is `(thread_id, user_id) WHERE
 * user_id IS NOT NULL`, and a contact participant has `user_id` NULL, so no
 * constraint matches and every repeat external email would re-insert the SAME
 * contact as a new participant. Find-or-create at the app level instead: SELECT
 * for an existing `(thread_id, contact_entity_id)` row (org-scoped) and skip the
 * insert when present. Avoids a schema/index migration that would break prod on
 * pre-existing duplicate rows. Idempotent: a repeat sender's add is a no-op.
 */
async function ensureCommsContactParticipant(
	db: typeof import("@rox/db/client").db,
	args: { organizationId: string; threadId: string; contactEntityId: string },
): Promise<void> {
	const [existing] = await db
		.select({ id: commsParticipants.id })
		.from(commsParticipants)
		.where(
			and(
				eq(commsParticipants.organizationId, args.organizationId),
				eq(commsParticipants.threadId, args.threadId),
				eq(commsParticipants.contactEntityId, args.contactEntityId),
			),
		)
		.limit(1);
	if (existing) return;

	await db
		.insert(commsParticipants)
		.values({
			organizationId: args.organizationId,
			threadId: args.threadId,
			contactEntityId: args.contactEntityId,
			role: "member" as const,
		})
		.onConflictDoNothing();
}

/** Build the production {@link MailIngestDb} bound to the live Drizzle client. */
export function createMailIngestDb(): MailIngestDb {
	return {
		async findAddressByValue(address) {
			const [row] = await db
				.select({
					id: mailAddresses.id,
					userId: mailAddresses.userId,
					organizationId: mailAddresses.organizationId,
					status: mailAddresses.status,
					graceUntil: mailAddresses.graceUntil,
				})
				.from(mailAddresses)
				.where(eq(mailAddresses.address, address))
				.limit(1);
			return row ?? null;
		},

		async findMessageByMsgId({ ownerUserId, rfcMessageId }) {
			const [row] = await db
				.select({ id: mailMessages.id, threadId: mailMessages.threadId })
				.from(mailMessages)
				.where(
					and(
						eq(mailMessages.ownerUserId, ownerUserId),
						eq(mailMessages.rfcMessageId, rfcMessageId),
					),
				)
				.limit(1);
			return row ?? null;
		},

		async findThread({ ownerUserId, rootMessageRef, subjectNorm }) {
			const conds = [];
			if (rootMessageRef) {
				conds.push(eq(mailThreads.rootMessageRef, rootMessageRef));
			}
			if (subjectNorm) {
				conds.push(eq(mailThreads.subjectNorm, subjectNorm));
			}
			if (conds.length === 0) return null;
			const [row] = await db
				.select({ id: mailThreads.id })
				.from(mailThreads)
				.where(
					and(
						eq(mailThreads.ownerUserId, ownerUserId),
						conds.length === 1 ? conds[0] : or(...conds),
					),
				)
				.orderBy(desc(mailThreads.lastMessageAt))
				.limit(1);
			return row ?? null;
		},

		async createThread(args) {
			const [row] = await db
				.insert(mailThreads)
				.values({
					organizationId: args.organizationId,
					ownerUserId: args.ownerUserId,
					rootMessageRef: args.rootMessageRef,
					subjectNorm: args.subjectNorm,
					lastMessageAt: args.lastMessageAt,
					messageCount: 1,
				})
				.returning({ id: mailThreads.id });
			if (!row) throw new Error("Failed to create mail thread");
			return row;
		},

		async touchThread({ threadId, lastMessageAt }) {
			await db
				.update(mailThreads)
				.set({
					lastMessageAt,
					messageCount: sql`${mailThreads.messageCount} + 1`,
				})
				.where(eq(mailThreads.id, threadId));
		},

		async insertMessage(row) {
			const [inserted] = await db
				.insert(mailMessages)
				// biome-ignore lint/suspicious/noExplicitAny: orchestration builds the typed row
				.values(row as any)
				.returning({ id: mailMessages.id });
			if (!inserted) throw new Error("Failed to insert mail message");
			return inserted;
		},

		async insertAttachments(rows: AnyRow[]) {
			if (rows.length === 0) return;
			await db
				.insert(mailAttachments)
				// biome-ignore lint/suspicious/noExplicitAny: orchestration builds typed rows
				.values(rows as any);
		},

		async emitToUnifiedInbox(args) {
			// M1: derive the SAME cross-transport dedup key the comms-core router
			// uses — a reply-root id when present, else the sorted participant set —
			// so an inbound email merges with the in-app DM between the same parties
			// instead of forking. The old key (raw Message-ID) never matched the
			// in-app side and forked every email into its own orphan thread.
			const dedupKey =
				deriveDedupKey({
					rootExternalId: args.inReplyTo ?? null,
					participantAddresses: [args.fromAddr, ...args.toAddrs],
				}) ??
				args.rfcMessageId ??
				args.mailMessageId;

			// Inbound idempotency is PER ORG. The dedup unique on comms_messages is
			// `(organization_id, transport, external_id)`, so this short-circuit must
			// be org-scoped too: skip the MESSAGE insert only when THIS org already
			// has the row (a provider redelivery, OR a SECOND same-org recipient whose
			// envelope carries the same Message-ID). A SECOND rox recipient in a
			// DIFFERENT org has no row here and falls through to create their OWN
			// per-org thread/participant/message copy — otherwise their unified inbox
			// never shows the email (the old global check returned early on recipient
			// #1's cross-org row and dropped it).
			const [dup] = args.rfcMessageId
				? await db
						.select({
							id: commsMessages.id,
							threadId: commsMessages.threadId,
						})
						.from(commsMessages)
						.where(
							and(
								eq(commsMessages.organizationId, args.organizationId),
								eq(commsMessages.transport, "email"),
								eq(commsMessages.externalId, args.rfcMessageId),
							),
						)
						.limit(1)
				: [];

			// M1: resolve a known rox sender (an internal email between rox users)
			// to its author user id so the message is attributed.
			const [senderAddr] = await db
				.select({ userId: commsAddresses.userId })
				.from(commsAddresses)
				.where(
					and(
						eq(commsAddresses.kind, "email"),
						eq(commsAddresses.value, args.fromAddr.trim().toLowerCase()),
						eq(commsAddresses.isAlias, false),
					),
				)
				.limit(1);
			const authorUserId = senderAddr?.userId ?? null;

			// PER-ORG dedup reconcile: the row already exists for THIS org, so the
			// MESSAGE insert is skipped (idempotent). But a SECOND same-org recipient
			// (e.g. alice@rox.one + bob@rox.one both on To:) shares ONE org + ONE
			// Message-ID with recipient #1 — recipient #1 created the thread+message and
			// added themselves; recipient #2's envelope lands HERE on the dup and, with a
			// bare `return`, was NEVER attached to comms_participants, so
			// isThreadParticipant denied bob → listThreads/getThread omitted the thread
			// and the SSE gate dropped his live event. Fix: ALWAYS reconcile participants
			// for the CURRENT recipient on the EXISTING thread before returning. Only the
			// message INSERT is deduped; participant attach runs for every recipient,
			// idempotent on the (thread_id, user_id) partial unique so a genuine
			// same-owner redelivery adds no duplicate participant. No new comms_message and
			// no live publish (recipient #1's emit already pushed it).
			if (dup) {
				await ensureCommsParticipants(db, {
					organizationId: args.organizationId,
					threadId: dup.threadId,
					userIds: [args.ownerUserId, authorUserId],
				});
				return;
			}

			// M1: an EXTERNAL sender (no rox address) resolves-or-creates a D6 contact
			// node — the same find-or-create the comms-core `resolveContact` port uses
			// — so the email is attributed to that contact instead of staying
			// unauthored. Internal rox→rox mail skips this (it's already authored).
			const authorContactEntityId = authorUserId
				? null
				: await resolveExternalContact({
						organizationId: args.organizationId,
						emailAddress: args.fromAddr.trim().toLowerCase(),
					});

			const threadId = await findOrCreateCommsThread(db, {
				organizationId: args.organizationId,
				dedupKey,
				subject: args.subject,
			});

			// FIX 1: a pure-email thread (external sender, no pre-existing in-app DM)
			// must have its mailbox OWNER as a comms_participant — otherwise the SSE
			// leak-gate (`isThreadParticipant`) drops every email event and the
			// participant-scoped comms.listThreads/getThread never surface it. The
			// resolvable rox counterpart (an internal `@rox.one` sender) is added too
			// so an internal email shows for BOTH parties. Idempotent on (thread,user).
			await ensureCommsParticipants(db, {
				organizationId: args.organizationId,
				threadId,
				userIds: [args.ownerUserId, authorUserId],
			});

			// M1: an external sender joins the thread as a contact-node participant
			// (FK-less `contact_entity_id`) so the pure-email thread shows its external
			// counterpart. Skipped for internal mail (no contact was resolved).
			if (authorContactEntityId) {
				await ensureCommsContactParticipant(db, {
					organizationId: args.organizationId,
					threadId,
					contactEntityId: authorContactEntityId,
				});
			}

			// Guard the org-scoped (organization_id, transport, external_id) unique —
			// a concurrent redelivery to the SAME org that slipped past the read-check
			// above becomes a no-op instead of a 500. The backing index is PARTIAL
			// (`WHERE external_id IS NOT NULL`), so the conflict arbiter must carry the
			// SAME predicate, else Postgres throws 42P10 ("no unique or exclusion
			// constraint matching the ON CONFLICT specification") — same lesson as the
			// xmpp offline-queue enqueue. A different-org recipient never conflicts here
			// (their org segments the unique), so each org keeps its own copy.
			const [inserted] = await db
				.insert(commsMessages)
				.values({
					organizationId: args.organizationId,
					threadId,
					transport: "email",
					direction: "inbound",
					authorUserId,
					authorContactEntityId,
					externalId: args.rfcMessageId,
					inReplyToExternalId: args.inReplyTo,
					body: args.snippet,
					metadata: { mailMessageId: args.mailMessageId, source: "d3-email" },
				})
				.onConflictDoNothing({
					target: [
						commsMessages.organizationId,
						commsMessages.transport,
						commsMessages.externalId,
					],
					where: sql`${commsMessages.externalId} IS NOT NULL`,
				})
				.returning({ id: commsMessages.id });

			// Live delivery (comms SSE): publish ONLY when a NEW row was inserted — a
			// same-org dedup no-op (provider redelivery / lost insert race) must not
			// re-push. A second recipient in a DIFFERENT org DID insert their own row,
			// so they get their own event here. The SSE route re-checks participation,
			// so the advisory set is just the recipient owner. Best-effort: never let a
			// publish failure break ingest.
			if (inserted) {
				publishCommsMessage({
					organizationId: args.organizationId,
					threadId,
					messageId: inserted.id,
					transport: "email",
					authorUserId,
					participantUserIds: [
						...new Set(
							[args.ownerUserId, authorUserId].filter((id): id is string =>
								Boolean(id),
							),
						),
					],
				});
			}
		},
	};
}
