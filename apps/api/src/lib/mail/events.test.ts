import { describe, expect, test } from "bun:test";
import {
	type MailEventsDb,
	processResendEvent,
	statusForEvent,
} from "./events";

type Recorder = {
	recorded: { providerEventId: string; eventType: string }[];
	statusUpdates: { messageId: string; status: string }[];
	complaints: string[];
	dedupSeen: Set<string>;
	message: {
		id: string;
		organizationId: string;
		addressId: string | null;
	} | null;
};

function makeDb(over: Partial<Recorder> = {}): {
	db: MailEventsDb;
	rec: Recorder;
} {
	const rec: Recorder = {
		recorded: [],
		statusUpdates: [],
		complaints: [],
		dedupSeen: new Set(),
		message: { id: "msg-1", organizationId: "org-1", addressId: "addr-1" },
		...over,
	};
	const db: MailEventsDb = {
		async recordEvent(args) {
			if (rec.dedupSeen.has(args.providerEventId)) return false;
			rec.dedupSeen.add(args.providerEventId);
			rec.recorded.push({
				providerEventId: args.providerEventId,
				eventType: args.eventType,
			});
			return true;
		},
		async findMessageByProviderId() {
			return rec.message;
		},
		async updateMessageStatus(messageId, status) {
			rec.statusUpdates.push({ messageId, status });
		},
		async incrementComplaint(addressId) {
			rec.complaints.push(addressId);
		},
	};
	return { db, rec };
}

describe("statusForEvent", () => {
	test("maps known delivery events", () => {
		expect(statusForEvent("email.delivered")).toBe("delivered");
		expect(statusForEvent("email.bounced")).toBe("bounced");
		expect(statusForEvent("email.complained")).toBe("complained");
		expect(statusForEvent("email.failed")).toBe("failed");
	});
	test("returns null for non-status events", () => {
		expect(statusForEvent("email.sent")).toBeNull();
		expect(statusForEvent("email.delivery_delayed")).toBeNull();
		expect(statusForEvent("nonsense")).toBeNull();
	});
});

describe("processResendEvent", () => {
	test("advances status on delivery and records the event", async () => {
		const { db, rec } = makeDb();
		const res = await processResendEvent(db, "svix-1", {
			type: "email.delivered",
			data: { email_id: "resend-evt-1" },
		});
		expect(res).toMatchObject({ kind: "applied", status: "delivered" });
		expect(rec.statusUpdates).toEqual([
			{ messageId: "msg-1", status: "delivered" },
		]);
		expect(rec.complaints).toHaveLength(0);
	});

	test("bumps the complaint counter on a complaint", async () => {
		const { db, rec } = makeDb();
		const res = await processResendEvent(db, "svix-2", {
			type: "email.complained",
			data: { email_id: "resend-evt-1" },
		});
		expect(res).toMatchObject({ kind: "applied", status: "complained" });
		expect(rec.complaints).toEqual(["addr-1"]);
	});

	test("is idempotent: a duplicate svix-id is a no-op", async () => {
		const { db, rec } = makeDb();
		const seen = new Set<string>(["svix-dup"]);
		rec.dedupSeen = seen;
		const res = await processResendEvent(db, "svix-dup", {
			type: "email.delivered",
			data: { email_id: "resend-evt-1" },
		});
		expect(res).toEqual({ kind: "duplicate" });
		expect(rec.statusUpdates).toHaveLength(0);
	});

	test("records but does not update when no message matches", async () => {
		const { db, rec } = makeDb({ message: null });
		const res = await processResendEvent(db, "svix-3", {
			type: "email.bounced",
			data: { email_id: "unknown" },
		});
		expect(res).toMatchObject({ kind: "no_message" });
		expect(rec.recorded).toHaveLength(1);
		expect(rec.statusUpdates).toHaveLength(0);
	});

	test("ignores a non-status event after recording it", async () => {
		const { db, rec } = makeDb();
		const res = await processResendEvent(db, "svix-4", {
			type: "email.sent",
			data: { email_id: "resend-evt-1" },
		});
		expect(res).toMatchObject({ kind: "ignored" });
		expect(rec.recorded).toHaveLength(1);
		expect(rec.statusUpdates).toHaveLength(0);
	});
});
