import { describe, expect, it } from "bun:test";
import { deriveDedupKey } from "./dedup";

describe("deriveDedupKey", () => {
	it("prefers a reply root when present", () => {
		expect(
			deriveDedupKey({
				rootExternalId: "<root@mail>",
				participantAddresses: ["a@x.com", "b@y.com"],
			}),
		).toBe("root:<root@mail>");
	});

	it("falls back to a sorted, deduped participant set", () => {
		const key = deriveDedupKey({
			rootExternalId: null,
			participantAddresses: ["Bob@y.com", "alice@x.com", "alice@x.com"],
		});
		expect(key).toBe("parts:alice@x.com,bob@y.com");
	});

	it("is order-independent for the same participant set", () => {
		const a = deriveDedupKey({
			rootExternalId: null,
			participantAddresses: ["a@x.com", "b@y.com"],
		});
		const b = deriveDedupKey({
			rootExternalId: null,
			participantAddresses: ["b@y.com", "a@x.com"],
		});
		expect(a).toBe(b);
	});

	it("returns null with no usable signal", () => {
		expect(
			deriveDedupKey({
				rootExternalId: null,
				participantAddresses: ["", "  "],
			}),
		).toBeNull();
	});
});
