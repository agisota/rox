import { describe, expect, it, test } from "bun:test";

import {
	accessRoleEnum,
	accessRoleValues,
	deviceTypeValues,
	integrationProviderEnum,
	integrationProviderValues,
	roxLedgerKindValues,
	roxTopupStatusValues,
	sandboxStatusEnum,
	sandboxStatusValues,
	taskPriorityValues,
	taskStatusEnum,
	taskStatusEnumValues,
	v2HostKindValues,
	v2ManagedHostKindValues,
} from "./enums";

// These enums back Postgres pgEnums and are append-only string unions. The
// repo contract (see comments in enums.ts) is "NEVER reorder/remove values" —
// reordering breaks the pgEnum on-disk ordinal mapping and removing a value
// breaks existing rows. These tests pin the exact membership/order of the
// load-bearing enums so an accidental edit fails loudly offline (no DB needed).
describe("enum value lists", () => {
	test("integrationProviderValues holds the exact set of providers in order", () => {
		expect(integrationProviderValues).toEqual([
			"linear",
			"github",
			"slack",
			"telegram",
			"discord",
			"notion",
			"obsidian",
			"fibery",
			"lark",
		]);
	});

	test("taskStatusEnumValues holds the exact lifecycle in order", () => {
		expect(taskStatusEnumValues).toEqual([
			"backlog",
			"todo",
			"planning",
			"working",
			"needs-feedback",
			"ready-to-merge",
			"completed",
			"canceled",
		]);
	});

	test("taskPriorityValues holds the exact priority ladder in order", () => {
		expect(taskPriorityValues).toEqual([
			"urgent",
			"high",
			"medium",
			"low",
			"none",
		]);
	});

	test("accessRoleValues are the three RBAC roles in order", () => {
		expect(accessRoleValues).toEqual(["viewer", "editor", "admin"]);
	});

	test("deviceTypeValues cover the three client surfaces", () => {
		expect(deviceTypeValues).toEqual(["desktop", "mobile", "web"]);
	});

	test("enum value lists are free of duplicates", () => {
		const lists = {
			integrationProviderValues,
			taskStatusEnumValues,
			taskPriorityValues,
			sandboxStatusValues,
			roxLedgerKindValues,
			roxTopupStatusValues,
			accessRoleValues,
		};
		for (const [name, values] of Object.entries(lists)) {
			expect(new Set(values).size, `${name} has duplicate values`).toBe(
				values.length,
			);
		}
	});

	test("v2ManagedHostKindValues is a strict subset of v2HostKindValues", () => {
		const hostKinds = new Set<string>(v2HostKindValues);
		for (const managed of v2ManagedHostKindValues) {
			expect(hostKinds.has(managed), `${managed} is a valid host kind`).toBe(
				true,
			);
		}
		// "local" is a host kind but is NOT a managed (provider-backed) kind.
		expect(v2ManagedHostKindValues).not.toContain("local");
	});
});

// Each *Values array has a paired z.enum(...) built from it. Verify the zod
// enum derived from the array accepts exactly the listed members and rejects
// anything else — this guards against the array and the z.enum drifting apart.
describe("derived z.enum membership", () => {
	test("integrationProviderEnum accepts every listed provider", () => {
		for (const provider of integrationProviderValues) {
			expect(integrationProviderEnum.safeParse(provider).success).toBe(true);
		}
	});

	test("integrationProviderEnum rejects unknown providers", () => {
		expect(integrationProviderEnum.safeParse("jira").success).toBe(false);
		expect(integrationProviderEnum.safeParse("").success).toBe(false);
		expect(integrationProviderEnum.safeParse("GitHub").success).toBe(false);
	});

	test("taskStatusEnum round-trips every status value", () => {
		for (const status of taskStatusEnumValues) {
			const parsed = taskStatusEnum.parse(status);
			expect(parsed).toBe(status);
		}
	});

	test("taskStatusEnum rejects a non-status string", () => {
		expect(taskStatusEnum.safeParse("in-progress").success).toBe(false);
	});

	test("accessRoleEnum rejects an unknown role", () => {
		expect(accessRoleEnum.safeParse("owner").success).toBe(false);
		expect(accessRoleEnum.safeParse("admin").success).toBe(true);
	});

	test("sandboxStatusEnum rejects values outside the lifecycle", () => {
		for (const status of sandboxStatusValues) {
			expect(sandboxStatusEnum.safeParse(status).success).toBe(true);
		}
		expect(sandboxStatusEnum.safeParse("deleted").success).toBe(false);
	});

	test("z.enum.options matches the source value array exactly", () => {
		expect(integrationProviderEnum.options).toEqual([
			...integrationProviderValues,
		]);
		expect(taskStatusEnum.options).toEqual([...taskStatusEnumValues]);
	});
});

import { dashboardSectionKindEnum, dashboardSectionKindValues } from "./enums";

describe("dashboardSectionKindValues (WS-O T1)", () => {
	it("exposes the 8 collaborative-dashboard section kinds in stable order", () => {
		expect(dashboardSectionKindValues).toEqual([
			"config",
			"recommendation",
			"note",
			"priority",
			"artifact",
			"product",
			"reference",
			"log",
		]);
	});

	it("backs a zod enum accepting every value and rejecting unknown kinds", () => {
		for (const value of dashboardSectionKindValues) {
			expect(dashboardSectionKindEnum.parse(value)).toBe(value);
		}
		expect(() => dashboardSectionKindEnum.parse("unknown")).toThrow();
	});

	it("is append-only/immutable at the type level (const tuple)", () => {
		// `as const` tuple: length is fixed and known at compile time.
		expect(dashboardSectionKindValues.length).toBe(8);
	});
});

import {
	commsAddressKindEnum,
	commsAddressKindValues,
	commsDeliveryStatusValues,
	commsDirectionValues,
	commsParticipantRoleValues,
	commsPresenceStateValues,
	commsTransportValues,
	driveFileStatusEnum,
	driveFileStatusValues,
	driveOveragePolicyValues,
	driveRefSourceValues,
	driveSharePermValues,
} from "./enums";

// Rox Workspace Suite — D1 comms + D8/D9 drive enums (P0). Append-only string
// unions backing Postgres pgEnums; pin membership/order so an accidental edit
// fails loudly offline (no DB needed), matching the existing enum guards above.
describe("comms-suite enum value lists (D1 + D8/D9)", () => {
	it("roxLedgerKindValues appends drive_overage + mail_send at the END (ordinal-safe)", () => {
		// DECISIONS.md DQ2: overage debits rox_ledger with kind 'drive_overage';
		// M3 debits per outbound send with kind 'mail_send'. The original four
		// values must keep their order so the pgEnum ordinals of existing rows are
		// unchanged; new kinds are appended.
		expect(roxLedgerKindValues).toEqual([
			"topup",
			"request_charge",
			"adjustment",
			"seed",
			"drive_overage",
			"mail_send",
		]);
	});

	it("comms_address_kind covers the four transports a handle derives", () => {
		expect(commsAddressKindValues).toEqual(["email", "xmpp", "mesh", "inapp"]);
	});

	it("comms_transport / direction / participant_role hold the expected sets", () => {
		expect(commsTransportValues).toEqual(["inapp", "email", "xmpp", "mesh"]);
		expect(commsDirectionValues).toEqual(["inbound", "outbound"]);
		expect(commsParticipantRoleValues).toEqual(["owner", "member"]);
	});

	it("comms_delivery_status + comms_presence_state lifecycles", () => {
		expect(commsDeliveryStatusValues).toEqual([
			"queued",
			"sent",
			"delivered",
			"failed",
			"bounced",
		]);
		expect(commsPresenceStateValues).toEqual([
			"online",
			"away",
			"dnd",
			"offline",
		]);
	});

	it("drive_file_status / share_perm / ref_source / overage_policy sets", () => {
		expect(driveFileStatusValues).toEqual([
			"pending",
			"clean",
			"scanning",
			"quarantined",
			"trashed",
		]);
		expect(driveSharePermValues).toEqual(["view", "download"]);
		expect(driveRefSourceValues).toEqual([
			"chat_message",
			"email_message",
			"canvas",
			"other",
		]);
		expect(driveOveragePolicyValues).toEqual([
			"block_new",
			"soft_meter",
			"hard_cap",
		]);
	});

	it("derived z.enums round-trip + reject unknowns", () => {
		for (const value of commsAddressKindValues) {
			expect(commsAddressKindEnum.parse(value)).toBe(value);
		}
		expect(commsAddressKindEnum.safeParse("sms").success).toBe(false);
		for (const value of driveFileStatusValues) {
			expect(driveFileStatusEnum.parse(value)).toBe(value);
		}
		expect(driveFileStatusEnum.safeParse("deleted").success).toBe(false);
	});

	it("all comms-suite enum lists are free of duplicates", () => {
		const lists = {
			commsAddressKindValues,
			commsTransportValues,
			commsDirectionValues,
			commsParticipantRoleValues,
			commsDeliveryStatusValues,
			commsPresenceStateValues,
			driveFileStatusValues,
			driveSharePermValues,
			driveRefSourceValues,
			driveOveragePolicyValues,
		};
		for (const [name, values] of Object.entries(lists)) {
			expect(new Set(values).size, `${name} has duplicate values`).toBe(
				values.length,
			);
		}
	});
});
