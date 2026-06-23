import { describe, expect, test } from "bun:test";
import { wrapEvent } from "nostr-tools/nip17";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { DM_KIND, GIFT_WRAP_KIND, unwrapGiftWrap } from "./unwrap";

/**
 * End-to-end crypto proof: seal a DM to the escrow pubkey with the SAME NIP-17
 * gift-wrap a real client uses (`nip17.wrapEvent`), then unwrap it server-side
 * with the escrow PRIVATE key and assert the recovered plaintext + sender. This
 * is the load-bearing test for the server-escrow receive path.
 */

const senderSk = generateSecretKey();
const senderPub = getPublicKey(senderSk);

const escrowSk = generateSecretKey();
const escrowPub = getPublicKey(escrowSk);

function makeGiftWrapToEscrow(message: string, conversationTitle?: string) {
	// A real NIP-17 gift-wrap (kind 1059) sealing `message` from the sender to the
	// escrow recipient — exactly what the relay-watcher receives off the wire.
	return wrapEvent(
		senderSk,
		{ publicKey: escrowPub },
		message,
		conversationTitle,
	);
}

describe("unwrapGiftWrap", () => {
	test("recovers plaintext + real sender from a NIP-17 gift-wrap", () => {
		const wrap = makeGiftWrapToEscrow("hello over the mesh", "trip plans");
		expect(wrap.kind).toBe(GIFT_WRAP_KIND);

		const envelope = unwrapGiftWrap(wrap, escrowSk, {
			escrowPubkey: escrowPub,
		});

		expect(envelope.body).toBe("hello over the mesh");
		// The inner rumor's pubkey is the REAL sender (not the gift-wrap's ephemeral).
		expect(envelope.fromPubkey).toBe(senderPub);
		// Recipient resolves to the escrow pubkey the DM was sealed to.
		expect(envelope.toPubkey).toBe(escrowPub);
		expect(envelope.kind).toBe(DM_KIND);
		expect(envelope.subject).toBe("trip plans");
		expect(typeof envelope.eventId).toBe("string");
		expect(envelope.eventId?.length).toBe(64); // sha256 event id hex
		expect(typeof envelope.sentAt).toBe("number");
	});

	test("carries the relay url through as telemetry", () => {
		const wrap = makeGiftWrapToEscrow("ping");
		const envelope = unwrapGiftWrap(wrap, escrowSk, {
			escrowPubkey: escrowPub,
			relayUrl: "wss://relay.rox.one",
		});
		expect(envelope.relayUrl).toBe("wss://relay.rox.one");
	});

	test("a DIFFERENT escrow key cannot decrypt the wrap (throws)", () => {
		const wrap = makeGiftWrapToEscrow("secret");
		const wrongSk = generateSecretKey();
		// Decryption with the wrong key fails inside nip44 → unwrap throws.
		expect(() =>
			unwrapGiftWrap(wrap, wrongSk, { escrowPubkey: getPublicKey(wrongSk) }),
		).toThrow();
	});

	test("rejects a non-gift-wrap event without attempting decryption", () => {
		const notAWrap = {
			id: "0".repeat(64),
			pubkey: senderPub,
			kind: 1,
			content: "plain note",
			tags: [],
			created_at: Math.floor(Date.now() / 1000),
			sig: "0".repeat(128),
		};
		expect(() =>
			unwrapGiftWrap(notAWrap, escrowSk, { escrowPubkey: escrowPub }),
		).toThrow(/gift-wrap/);
	});

	test("no-subject DMs surface a null subject", () => {
		const wrap = makeGiftWrapToEscrow("no subject here");
		const envelope = unwrapGiftWrap(wrap, escrowSk, {
			escrowPubkey: escrowPub,
		});
		expect(envelope.subject).toBeNull();
	});
});
