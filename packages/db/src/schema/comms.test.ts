import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
	commsAddresses,
	commsDeliveries,
	commsKeypairs,
	commsMessages,
	commsParticipants,
	commsPresence,
	commsThreads,
} from "./comms";
import {
	commsAddressKindValues,
	commsDeliveryStatusValues,
	commsDirectionValues,
	commsParticipantRoleValues,
	commsPresenceStateValues,
	commsTransportValues,
} from "./enums";

function indexNames(table: PgTable): string[] {
	const cfg = getTableConfig(table);
	const fromIndexes = cfg.indexes.map(
		(i) => (i as unknown as { config: { name?: string } }).config?.name,
	);
	const fromUniques = cfg.uniqueConstraints.map((u) => u.name);
	return [...fromIndexes, ...fromUniques].filter(
		(n): n is string => typeof n === "string",
	);
}

function column(table: PgTable, name: string) {
	return getTableConfig(table).columns.find((c) => c.name === name);
}

// D1 — Identity & Comms Hub. These tables are the unified-inbox spine: one
// handle derives every address, and one thread carries messages from any
// transport. The owner-locked decisions DQ3 (global per-user identity) + DQ4
// (handle reservation + 90d alias) shape the columns asserted here.
describe("comms_addresses (D1 — DQ4 handle reservation/alias)", () => {
	const cfg = getTableConfig(commsAddresses);

	it("is named comms_addresses with the identity/org spine", () => {
		expect(cfg.name).toBe("comms_addresses");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("organization_id");
		expect(cols).toContain("user_id");
		expect(cols).toContain("kind");
		expect(cols).toContain("value");
	});

	it("carries the DQ4 reservation/alias-grace columns", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("is_primary");
		expect(cols).toContain("is_alias");
		expect(cols).toContain("alias_expires_at");
		expect(cols).toContain("verified");
	});

	it("kind is wired to the comms_address_kind enum", () => {
		expect(column(commsAddresses, "kind")?.enumValues).toEqual([
			...commsAddressKindValues,
		]);
	});

	it("uniquely resolves one address per (org, kind, value) + indexes inbound lookup", () => {
		const names = indexNames(commsAddresses);
		expect(names).toContain("comms_addresses_org_kind_value_uniq");
		expect(names).toContain("comms_addresses_kind_value_idx");
		expect(names).toContain("comms_addresses_user_idx");
	});
});

describe("comms_keypairs (D1 — public key only, secret_ref pointer)", () => {
	const cfg = getTableConfig(commsKeypairs);

	it("stores a PUBLIC key + secret_ref pointer, never the private key", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("comms_keypairs");
		expect(cols).toContain("public_key");
		expect(cols).toContain("secret_ref");
		expect(cols).toContain("algo");
		expect(cols).not.toContain("private_key");
		expect(cols).not.toContain("secret_key");
	});

	it("uniques one keypair per (user, algo)", () => {
		expect(indexNames(commsKeypairs)).toContain(
			"comms_keypairs_user_algo_uniq",
		);
	});
});

describe("comms_threads (D1 — cross-transport conversation)", () => {
	const cfg = getTableConfig(commsThreads);

	it("has subject, last_message_at, and a cross-transport dedup_key", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("comms_threads");
		expect(cols).toContain("organization_id");
		expect(cols).toContain("subject");
		expect(cols).toContain("last_message_at");
		expect(cols).toContain("dedup_key");
	});

	it("indexes the org-leading inbox feed + dedup match", () => {
		const names = indexNames(commsThreads);
		expect(names).toContain("comms_threads_org_last_message_idx");
		expect(names).toContain("comms_threads_org_dedup_idx");
	});
});

describe("comms_participants (D1 — rox user OR external contact)", () => {
	const cfg = getTableConfig(commsParticipants);

	it("links a thread to a user_id OR an external contact_entity_id", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("comms_participants");
		expect(cols).toContain("thread_id");
		expect(cols).toContain("user_id");
		expect(cols).toContain("contact_entity_id");
		expect(cols).toContain("last_read_message_id");
	});

	it("user_id and contact_entity_id are both nullable (one or the other)", () => {
		expect(column(commsParticipants, "user_id")?.notNull).toBe(false);
		expect(column(commsParticipants, "contact_entity_id")?.notNull).toBe(false);
	});

	it("role is wired to the comms_participant_role enum", () => {
		expect(column(commsParticipants, "role")?.enumValues).toEqual([
			...commsParticipantRoleValues,
		]);
	});

	it("uniques a rox user once per thread + indexes thread/user", () => {
		const names = indexNames(commsParticipants);
		expect(names).toContain("comms_participants_thread_user_uniq");
		expect(names).toContain("comms_participants_thread_idx");
		expect(names).toContain("comms_participants_user_idx");
	});
});

describe("comms_messages (D1 — one row per message, any transport)", () => {
	const cfg = getTableConfig(commsMessages);

	it("carries transport, direction, external dedup ids, body + attachments", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("comms_messages");
		expect(cols).toContain("thread_id");
		expect(cols).toContain("transport");
		expect(cols).toContain("direction");
		expect(cols).toContain("external_id");
		expect(cols).toContain("in_reply_to_external_id");
		expect(cols).toContain("body");
		expect(cols).toContain("attachments");
		expect(cols).toContain("received_at");
	});

	it("transport + direction wired to their enums", () => {
		expect(column(commsMessages, "transport")?.enumValues).toEqual([
			...commsTransportValues,
		]);
		expect(column(commsMessages, "direction")?.enumValues).toEqual([
			...commsDirectionValues,
		]);
	});

	it("indexes thread read + PER-ORG inbound-idempotency (organization_id, transport, external_id)", () => {
		const names = indexNames(commsMessages);
		expect(names).toContain("comms_messages_org_thread_created_idx");
		// PER-ORG inbound dedup: the same RFC Message-ID delivered to two rox
		// recipients in different orgs must keep one copy PER ORG, so the unique is
		// org-scoped (not the old global (transport, external_id)).
		expect(names).toContain("comms_messages_org_transport_external_uniq");
		expect(names).not.toContain("comms_messages_transport_external_uniq");
		expect(names).toContain("comms_messages_author_idx");

		const dedupIdx = cfg.indexes.find(
			(i) =>
				(i as unknown as { config: { name?: string } }).config?.name ===
				"comms_messages_org_transport_external_uniq",
		) as
			| {
					config: { unique?: boolean; columns?: Array<{ name?: string }> };
			  }
			| undefined;
		expect(dedupIdx?.config.unique).toBe(true);
		const dedupCols = (dedupIdx?.config.columns ?? []).map((c) => c.name);
		expect(dedupCols).toEqual(["organization_id", "transport", "external_id"]);
	});
});

describe("comms_deliveries (D1 — outbound fan-out)", () => {
	const cfg = getTableConfig(commsDeliveries);

	it("tracks per-recipient delivery status + provider id", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("comms_deliveries");
		expect(cols).toContain("message_id");
		expect(cols).toContain("transport");
		expect(cols).toContain("to_address");
		expect(cols).toContain("status");
		expect(cols).toContain("provider_id");
		expect(cols).toContain("attempts");
	});

	it("status wired to comms_delivery_status enum", () => {
		expect(column(commsDeliveries, "status")?.enumValues).toEqual([
			...commsDeliveryStatusValues,
		]);
	});
});

describe("comms_presence (D1 — one merged row per user)", () => {
	const cfg = getTableConfig(commsPresence);

	it("is keyed by user_id with aggregate state + per_transport jsonb", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("comms_presence");
		expect(cols).toContain("user_id");
		expect(cols).toContain("organization_id");
		expect(cols).toContain("state");
		expect(cols).toContain("per_transport");
	});

	it("state wired to comms_presence_state enum", () => {
		expect(column(commsPresence, "state")?.enumValues).toEqual([
			...commsPresenceStateValues,
		]);
	});

	it("user_id is the primary key (one presence row per user)", () => {
		const pk = column(commsPresence, "user_id");
		expect(pk?.primary).toBe(true);
	});
});
