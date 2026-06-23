/**
 * `MessageRouter` — the inbound/outbound routing fabric (D1 §"Routing Engine").
 *
 * Pure domain logic. All persistence is performed through injected
 * {@link CommsPorts}; this class never imports a database client, so it
 * unit-tests entirely against in-memory fakes.
 *
 * Responsibilities:
 *  - `resolveCounterpart` — address/userId → rox user or external D6 contact.
 *  - `resolveThread`      — match an existing thread by dedup key / reply root,
 *                           else create one with its participants.
 *  - `selectTransport`    — pick a transport for a recipient by presence +
 *                           preference order.
 *  - `routeInbound`       — normalize → resolve → persist exactly once
 *                           (idempotent on `(transport, external_id)`).
 *  - `routeOutbound`      — fan a draft out to recipients, one delivery each.
 */

import type { AdapterRegistry } from "../adapter/AdapterRegistry";
import type { CommsPorts, ResolvedRecipient } from "../ports";
import type {
	CommsMessage,
	CommsThread,
	CommsTransport,
	Counterpart,
	NormalizedMessage,
	OutboundDraft,
	RecipientRef,
} from "../types";
import { deriveDedupKey } from "./dedup";

/** Preference order when a recipient is reachable on multiple transports. */
const DEFAULT_TRANSPORT_PREFERENCE: ReadonlyArray<CommsTransport> = [
	"inapp",
	"xmpp",
	"email",
	"mesh",
];

/** Presence states that count as "reachable in-app right now". */
const ONLINE_STATES = new Set(["online", "away", "dnd"]);

export interface MessageRouterOptions {
	ports: CommsPorts;
	adapters: AdapterRegistry;
	/** Override the transport preference order (highest priority first). */
	transportPreference?: ReadonlyArray<CommsTransport>;
}

/** Outcome of `routeInbound`. */
export interface RouteInboundResult {
	message: CommsMessage;
	thread: CommsThread;
	/** True when the message was already persisted (idempotent no-op). */
	deduped: boolean;
}

/** Outcome of `routeOutbound`. */
export interface RouteOutboundResult {
	message: CommsMessage;
	thread: CommsThread;
	deliveries: Array<{
		recipient: ResolvedRecipient;
		deliveryId: string;
		providerId: string | null;
		status: "sent" | "failed";
		error?: string;
	}>;
}

export class MessageRouter {
	private readonly ports: CommsPorts;
	private readonly adapters: AdapterRegistry;
	private readonly preference: ReadonlyArray<CommsTransport>;

	constructor(opts: MessageRouterOptions) {
		this.ports = opts.ports;
		this.adapters = opts.adapters;
		this.preference = opts.transportPreference ?? DEFAULT_TRANSPORT_PREFERENCE;
	}

	// -------------------------------------------------------------------------
	// resolveCounterpart
	// -------------------------------------------------------------------------

	/**
	 * Resolve a recipient reference to a counterpart. A rox user is resolved via
	 * `comms_addresses` (alias hits resolve to the current owner); an unknown
	 * external address find-or-creates a D6 contact.
	 */
	async resolveCounterpart(
		organizationId: string,
		ref: RecipientRef,
	): Promise<Counterpart> {
		if (ref.kind === "userId") {
			await this.ports.members?.assertMember({
				organizationId,
				userId: ref.userId,
			});
			return { type: "user", organizationId, userId: ref.userId };
		}

		const address = ref.address.trim().toLowerCase();
		const owned = await this.ports.addresses.findByValue({
			organizationId,
			value: address,
		});
		if (owned) {
			return {
				type: "user",
				organizationId,
				userId: owned.userId,
				address,
			};
		}

		// Unknown address → external contact (find-or-create via D6).
		const { contactEntityId } = await this.ports.contacts.resolveContact({
			organizationId,
			kind: "email",
			value: address,
		});
		return {
			type: "contact",
			organizationId,
			contactEntityId,
			address,
		};
	}

	// -------------------------------------------------------------------------
	// selectTransport
	// -------------------------------------------------------------------------

	/**
	 * Pick the transport to reach a counterpart. Rox users: in-app when online,
	 * else the next available preferred transport. External contacts: email.
	 */
	async selectTransport(counterpart: Counterpart): Promise<CommsTransport> {
		if (counterpart.type === "contact") {
			return "email";
		}

		const presence = await this.ports.presence.get({
			organizationId: counterpart.organizationId,
			userId: counterpart.userId,
		});

		const inAppReachable =
			this.adapters.has("inapp") &&
			presence !== null &&
			ONLINE_STATES.has(presence.state);

		if (inAppReachable) return "inapp";

		// Offline / no in-app adapter: first registered transport by preference
		// that isn't in-app, falling back to email.
		for (const t of this.preference) {
			if (t === "inapp") continue;
			if (this.adapters.has(t)) return t;
		}
		return "email";
	}

	// -------------------------------------------------------------------------
	// resolveThread
	// -------------------------------------------------------------------------

	/**
	 * Find the thread a message belongs to, or create one. Matching order:
	 *  1. the thread that already owns the `inReplyTo` external id (same convo);
	 *  2. an existing thread with the same dedup key;
	 *  3. otherwise create a fresh thread with the supplied participants.
	 */
	async resolveThread(args: {
		organizationId: string;
		transport: CommsTransport;
		inReplyToExternalId: string | null;
		dedupKey: string | null;
		subject: string | null;
		participants: Array<{
			userId: string | null;
			contactEntityId: string | null;
		}>;
	}): Promise<{ thread: CommsThread; created: boolean }> {
		const { organizationId } = args;

		if (args.inReplyToExternalId) {
			const byReply = await this.ports.threads.findThreadByMessageExternalId({
				organizationId,
				transport: args.transport,
				externalId: args.inReplyToExternalId,
			});
			if (byReply) {
				await this.ensureParticipants(
					byReply.id,
					organizationId,
					args.participants,
				);
				return { thread: byReply, created: false };
			}
		}

		if (args.dedupKey) {
			const byKey = await this.ports.threads.findByDedupKey({
				organizationId,
				dedupKey: args.dedupKey,
			});
			if (byKey) {
				await this.ensureParticipants(
					byKey.id,
					organizationId,
					args.participants,
				);
				return { thread: byKey, created: false };
			}
		}

		const thread = await this.ports.threads.createThread({
			organizationId,
			subject: args.subject,
			dedupKey: args.dedupKey,
			participants: args.participants.map((p, i) => ({
				userId: p.userId,
				contactEntityId: p.contactEntityId,
				role: i === 0 ? "owner" : "member",
			})),
		});
		return { thread, created: true };
	}

	private async ensureParticipants(
		threadId: string,
		organizationId: string,
		participants: Array<{
			userId: string | null;
			contactEntityId: string | null;
		}>,
	): Promise<void> {
		if (participants.length === 0) return;
		await this.ports.threads.addParticipants({
			threadId,
			organizationId,
			participants: participants.map((p) => ({
				userId: p.userId,
				contactEntityId: p.contactEntityId,
				role: "member",
			})),
		});
	}

	// -------------------------------------------------------------------------
	// routeInbound
	// -------------------------------------------------------------------------

	/**
	 * Ingest an inbound message. Idempotent: a redelivered webhook (same
	 * `(transport, external_id)`) is a no-op returning the existing row.
	 */
	async routeInbound(
		organizationId: string,
		normalized: NormalizedMessage,
	): Promise<RouteInboundResult> {
		// 1. Idempotency gate on (transport, external_id).
		if (normalized.externalId) {
			const existing = await this.ports.messages.findByExternalId({
				transport: normalized.transport,
				externalId: normalized.externalId,
			});
			if (existing) {
				const thread =
					(await this.ports.threads.findThreadByMessageExternalId({
						organizationId,
						transport: normalized.transport,
						externalId: normalized.externalId,
					})) ??
					({
						id: existing.threadId,
						organizationId,
						subject: normalized.subject,
						lastMessageAt: existing.createdAt,
						dedupKey: null,
					} satisfies CommsThread);
				return { message: existing, thread, deduped: true };
			}
		}

		// 2. Resolve author + recipients to counterparts.
		const author = await this.resolveCounterpart(organizationId, {
			kind: "address",
			address: normalized.from,
		});
		const recipients = await Promise.all(
			normalized.to.map((address) =>
				this.resolveCounterpart(organizationId, { kind: "address", address }),
			),
		);

		// 3. Resolve / create the thread.
		const dedupKey = deriveDedupKey({
			rootExternalId: normalized.inReplyToExternalId,
			participantAddresses: [normalized.from, ...normalized.to],
		});
		const participants = dedupeParticipants([author, ...recipients]);
		const { thread } = await this.resolveThread({
			organizationId,
			transport: normalized.transport,
			inReplyToExternalId: normalized.inReplyToExternalId,
			dedupKey,
			subject: normalized.subject,
			participants,
		});

		// 4. Persist the message.
		const message = await this.ports.messages.insert({
			organizationId,
			threadId: thread.id,
			transport: normalized.transport,
			direction: "inbound",
			authorUserId: author.type === "user" ? author.userId : null,
			authorContactEntityId:
				author.type === "contact" ? author.contactEntityId : null,
			externalId: normalized.externalId,
			inReplyToExternalId: normalized.inReplyToExternalId,
			body: normalized.body,
			bodyHtml: normalized.bodyHtml,
			attachments: normalized.attachments,
			metadata: normalized.metadata,
			createdAt: normalized.createdAt,
		});

		await this.ports.threads.touchLastMessageAt({
			threadId: thread.id,
			at: normalized.createdAt,
		});

		return { message, thread, deduped: false };
	}

	// -------------------------------------------------------------------------
	// routeOutbound
	// -------------------------------------------------------------------------

	/**
	 * Fan an outbound draft out to its recipients. Persists one `comms_messages`
	 * row + one `comms_deliveries` row per recipient, choosing a transport per
	 * recipient via {@link selectTransport} and delegating actual delivery to the
	 * registered adapter.
	 */
	async routeOutbound(draft: OutboundDraft): Promise<RouteOutboundResult> {
		const { organizationId } = draft;

		// 1. Resolve recipients to counterpart + transport + address.
		const resolved: ResolvedRecipient[] = [];
		for (const ref of draft.recipients) {
			const counterpart = await this.resolveCounterpart(organizationId, ref);
			const transport = await this.selectTransport(counterpart);
			resolved.push({
				counterpart,
				transport,
				toAddress: counterpartAddress(counterpart),
			});
		}

		// 2. Resolve / create the thread.
		const author: Counterpart = {
			type: "user",
			organizationId,
			userId: draft.authorUserId,
		};
		const dedupKey = deriveDedupKey({
			rootExternalId: null,
			participantAddresses: resolved.map((r) => r.toAddress),
		});
		const participants = dedupeParticipants([
			author,
			...resolved.map((r) => r.counterpart),
		]);

		let thread: CommsThread;
		if (draft.threadId) {
			thread = {
				id: draft.threadId,
				organizationId,
				subject: draft.subject ?? null,
				lastMessageAt: null,
				dedupKey,
			};
			await this.ensureParticipants(
				draft.threadId,
				organizationId,
				participants,
			);
		} else {
			const resolvedThread = await this.resolveThread({
				organizationId,
				transport: resolved[0]?.transport ?? "inapp",
				inReplyToExternalId: null,
				dedupKey,
				subject: draft.subject ?? null,
				participants,
			});
			thread = resolvedThread.thread;
		}

		// 3. Persist the outbound message once (transport recorded per-delivery).
		const message = await this.ports.messages.insert({
			organizationId,
			threadId: thread.id,
			transport: resolved[0]?.transport ?? "inapp",
			direction: "outbound",
			authorUserId: draft.authorUserId,
			authorContactEntityId: null,
			externalId: null,
			inReplyToExternalId: null,
			body: draft.body,
			bodyHtml: draft.bodyHtml ?? null,
			attachments: draft.attachments ?? [],
			metadata: draft.metadata ?? {},
			createdAt: new Date(),
		});

		// 4. Fan-out: one delivery per recipient via its adapter.
		const deliveries: RouteOutboundResult["deliveries"] = [];
		for (const recipient of resolved) {
			const delivery = await this.ports.deliveries.insert({
				organizationId,
				messageId: message.id,
				transport: recipient.transport,
				toAddress: recipient.toAddress,
				status: "queued",
			});

			const adapter = this.adapters.get(recipient.transport);
			if (!adapter) {
				await this.ports.deliveries.updateStatus({
					deliveryId: delivery.id,
					status: "failed",
					error: `No adapter registered for transport "${recipient.transport}"`,
				});
				deliveries.push({
					recipient,
					deliveryId: delivery.id,
					providerId: null,
					status: "failed",
					error: `No adapter registered for transport "${recipient.transport}"`,
				});
				continue;
			}

			try {
				const { providerId } = await adapter.send(draft, {
					toAddress: recipient.toAddress,
					delivery: {
						id: delivery.id,
						messageId: message.id,
						transport: recipient.transport,
					},
				});
				await this.ports.deliveries.updateStatus({
					deliveryId: delivery.id,
					status: "sent",
					providerId,
				});
				deliveries.push({
					recipient,
					deliveryId: delivery.id,
					providerId,
					status: "sent",
				});
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				await this.ports.deliveries.updateStatus({
					deliveryId: delivery.id,
					status: "failed",
					error,
				});
				deliveries.push({
					recipient,
					deliveryId: delivery.id,
					providerId: null,
					status: "failed",
					error,
				});
			}
		}

		await this.ports.threads.touchLastMessageAt({
			threadId: thread.id,
			at: message.createdAt,
		});

		return { message, thread, deliveries };
	}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function counterpartAddress(counterpart: Counterpart): string {
	if (counterpart.type === "contact") return counterpart.address;
	return counterpart.address ?? counterpart.userId;
}

/** Collapse counterparts to unique thread participants (by user/contact id). */
function dedupeParticipants(
	counterparts: Counterpart[],
): Array<{ userId: string | null; contactEntityId: string | null }> {
	const seen = new Set<string>();
	const out: Array<{ userId: string | null; contactEntityId: string | null }> =
		[];
	for (const c of counterparts) {
		const key = c.type === "user" ? `u:${c.userId}` : `c:${c.contactEntityId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			userId: c.type === "user" ? c.userId : null,
			contactEntityId: c.type === "contact" ? c.contactEntityId : null,
		});
	}
	return out;
}
