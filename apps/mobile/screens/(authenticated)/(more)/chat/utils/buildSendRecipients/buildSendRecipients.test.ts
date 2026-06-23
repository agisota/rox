import { describe, expect, test } from "bun:test";
import { buildSendRecipients } from "./buildSendRecipients";

const SELF = "00000000-0000-0000-0000-000000000000";
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("buildSendRecipients", () => {
	test("excludes self, drops null userIds, and dedupes", () => {
		const out = buildSendRecipients(
			[
				{ userId: SELF },
				{ userId: A },
				{ userId: null },
				{ userId: A },
				{ userId: B },
			],
			SELF,
		);
		expect(out).toEqual([
			{ kind: "userId", userId: A },
			{ kind: "userId", userId: B },
		]);
	});

	test("returns the correct {kind:'userId'} shape", () => {
		const out = buildSendRecipients([{ userId: A }], SELF);
		expect(out).toEqual([{ kind: "userId", userId: A }]);
	});

	test("returns [] for an empty participant list", () => {
		expect(buildSendRecipients([], SELF)).toEqual([]);
	});

	test("returns [] when every participant is self or null", () => {
		expect(
			buildSendRecipients([{ userId: SELF }, { userId: null }], SELF),
		).toEqual([]);
	});

	test("includes everyone when currentUserId is undefined (no self to exclude)", () => {
		const out = buildSendRecipients([{ userId: A }, { userId: B }], undefined);
		expect(out).toEqual([
			{ kind: "userId", userId: A },
			{ kind: "userId", userId: B },
		]);
	});
});
