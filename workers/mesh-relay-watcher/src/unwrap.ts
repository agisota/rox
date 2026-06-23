/**
 * Server-side NIP-17 / NIP-59 gift-wrap unwrap for the mesh relay-watcher.
 *
 * Inbound mesh DMs reach the relay as a NIP-59 gift-wrap (kind 1059) sealed to
 * the SERVER-HELD escrow pubkey. Because mesh is a transport-FALLBACK bridge (not
 * an E2E-private product), the watcher holds the escrow PRIVATE key and unwraps
 * the gift-wrap server-side, yielding the inner NIP-17 DM rumor (kind 14) whose
 * `content` is the plaintext body. That plaintext is then shaped into the
 * {@link RelayWatcherOutboundEvent} the API ingress (`/api/mesh/inbound`) expects.
 *
 * `nostr-tools/nip17.unwrapEvent` (an alias of `nip59.unwrapEvent`) does the
 * two-layer decrypt: gift-wrap → seal (nip44) → rumor. We then read the rumor's
 * sender pubkey, body, thread / reply / subject tags, and timestamp.
 *
 * Pure: no relay I/O, no env, no signing — so it unit-tests against a known
 * gift-wrap fixture (wrap a message with `nip17.wrapEvent`, unwrap here, assert
 * the recovered plaintext + sender).
 */

import { unwrapEvent } from "nostr-tools/nip17";
import type { Event as NostrEvent } from "nostr-tools/pure";
import type { RelayWatcherOutboundEvent } from "./contract";

/** NIP-59 gift-wrap kind. The relay subscription filters on this. */
export const GIFT_WRAP_KIND = 1059;
/** NIP-17 sealed direct-message kind (the inner rumor). */
export const DM_KIND = 14;

/** Read the first value of the first tag whose name matches. */
function firstTag(tags: string[][], name: string): string | null {
	for (const tag of tags) {
		if (tag[0] === name && typeof tag[1] === "string" && tag[1].length > 0) {
			return tag[1];
		}
	}
	return null;
}

/**
 * The recipient `p` tag inside the inner rumor is the escrow pubkey the DM was
 * sealed to — i.e. which rox-side identity should receive it. We carry it through
 * as `toPubkey` so the ingest pipeline resolves the recipient. When the rumor
 * omits it (some clients only tag the wrap), the caller's `escrowPubkey` is used.
 */
export interface UnwrapOptions {
	/** The escrow pubkey (hex) this watcher subscribes for — the fallback `to`. */
	escrowPubkey: string;
	/** The relay url the wrap was observed on (telemetry passthrough). */
	relayUrl?: string | null;
}

/**
 * Unwrap one NIP-59 gift-wrap (kind 1059) with the escrow private key into the
 * inbound envelope the API ingress consumes. Throws if the wrap is not a
 * gift-wrap or the inner rumor is not a DM, so a malformed/non-DM event is
 * skipped by the loop rather than POSTed.
 */
export function unwrapGiftWrap(
	wrap: NostrEvent,
	escrowPrivateKey: Uint8Array,
	opts: UnwrapOptions,
): RelayWatcherOutboundEvent {
	if (wrap.kind !== GIFT_WRAP_KIND) {
		throw new Error(
			`Expected a NIP-59 gift-wrap (kind ${GIFT_WRAP_KIND}), got kind ${wrap.kind}`,
		);
	}

	// nip17.unwrapEvent = nip59.unwrapEvent: gift-wrap → seal (nip44) → rumor.
	// The rumor is the inner kind:14 DM: `pubkey` = real sender, `content` =
	// plaintext, `tags` carry the recipient `p`, `subject`, and reply `e`.
	const rumor = unwrapEvent(wrap, escrowPrivateKey);

	if (rumor.kind !== DM_KIND) {
		throw new Error(
			`Expected an inner NIP-17 DM (kind ${DM_KIND}), got kind ${rumor.kind}`,
		);
	}

	const toPubkey = firstTag(rumor.tags, "p") ?? opts.escrowPubkey;
	const subject = firstTag(rumor.tags, "subject");
	const replyToEventId = firstTag(rumor.tags, "e");

	return {
		fromPubkey: rumor.pubkey,
		toPubkey,
		body: rumor.content,
		// The rumor id is the stable dedup key for this inner DM.
		eventId: rumor.id ?? null,
		subject: subject ?? null,
		replyToEventId: replyToEventId ?? null,
		kind: rumor.kind,
		relayUrl: opts.relayUrl ?? null,
		sentAt: rumor.created_at,
	};
}
