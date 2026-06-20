import { describe, expect, it } from "bun:test";
import { quotaView } from "./quotaView";

const CAP = 10 * 1024 ** 3; // 10 GiB

describe("quotaView", () => {
	it("computes a normal percentage well under cap", () => {
		const view = quotaView({
			bytesUsed: CAP / 2,
			quotaBytes: CAP,
			overageOptIn: false,
		});
		expect(view.percent).toBe(50);
		expect(view.isOver).toBe(false);
		expect(view.tone).toBe("normal");
	});

	it("flags warning tone at 90%+", () => {
		const view = quotaView({
			bytesUsed: CAP * 0.95,
			quotaBytes: CAP,
			overageOptIn: false,
		});
		expect(view.tone).toBe("warning");
		expect(view.percent).toBe(95);
	});

	it("clamps the bar at 100% but reports over bytes when past cap", () => {
		const view = quotaView({
			bytesUsed: CAP + 1024,
			quotaBytes: CAP,
			overageOptIn: true,
		});
		expect(view.percent).toBe(100);
		expect(view.isOver).toBe(true);
		expect(view.overBytes).toBe(1024);
		expect(view.tone).toBe("over");
	});

	it("handles a zero cap defensively", () => {
		const view = quotaView({
			bytesUsed: 5,
			quotaBytes: 0,
			overageOptIn: false,
		});
		expect(view.percent).toBe(100);
		expect(view.isOver).toBe(true);
	});
});
