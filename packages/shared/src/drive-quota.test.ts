import { describe, expect, test } from "bun:test";

import {
	BYTES_PER_GB,
	clampDecrement,
	computeUploadDecision,
	DEFAULT_DRIVE_OVERAGE_ROX_PER_GB_MONTH,
	DRIVE_FREE_QUOTA_BYTES,
	dailyOverageRox,
	overQuotaBytes,
	type QuotaState,
} from "./drive-quota";

const CAP = DRIVE_FREE_QUOTA_BYTES;

function state(partial: Partial<QuotaState> = {}): QuotaState {
	return {
		bytesUsed: 0,
		quotaBytes: CAP,
		overageOptIn: false,
		...partial,
	};
}

describe("DRIVE_FREE_QUOTA_BYTES", () => {
	test("is exactly 10 GiB (DQ2)", () => {
		expect(CAP).toBe(10 * 1024 ** 3);
		expect(CAP).toBe(10_737_418_240);
	});
});

describe("computeUploadDecision — within quota", () => {
	test("allows an upload that fits under the cap", () => {
		const d = computeUploadDecision(state({ bytesUsed: 1_000 }), 2_000);
		expect(d.allowed).toBe(true);
		expect(d.reason).toBe("within_quota");
		expect(d.projectedBytesUsed).toBe(3_000);
		expect(d.overageBytes).toBe(0);
	});

	test("allows an upload that exactly hits the cap", () => {
		const d = computeUploadDecision(state({ bytesUsed: CAP - 100 }), 100);
		expect(d.allowed).toBe(true);
		expect(d.reason).toBe("within_quota");
		expect(d.projectedBytesUsed).toBe(CAP);
		expect(d.overageBytes).toBe(0);
	});

	test("treats a zero/negative size as a no-op within quota", () => {
		expect(computeUploadDecision(state(), 0).reason).toBe("within_quota");
		expect(computeUploadDecision(state(), -5).overageBytes).toBe(0);
	});
});

describe("computeUploadDecision — over quota, NOT opted in (hard cap)", () => {
	test("blocks the new upload but never mutates bytesUsed", () => {
		const d = computeUploadDecision(state({ bytesUsed: CAP - 50 }), 100);
		expect(d.allowed).toBe(false);
		expect(d.reason).toBe("over_quota_blocked");
		expect(d.projectedBytesUsed).toBe(CAP - 50); // unchanged
		expect(d.overageBytes).toBe(0);
	});

	test("blocks even when already over the cap (existing files unaffected)", () => {
		const d = computeUploadDecision(state({ bytesUsed: CAP + 1_000 }), 10);
		expect(d.allowed).toBe(false);
		expect(d.reason).toBe("over_quota_blocked");
	});
});

describe("computeUploadDecision — over quota, opted in (soft-meter DQ2)", () => {
	test("allows the upload and reports only the slice past the cap", () => {
		const d = computeUploadDecision(
			state({ bytesUsed: CAP - 200, overageOptIn: true }),
			1_000,
		);
		expect(d.allowed).toBe(true);
		expect(d.reason).toBe("overage_accrued");
		expect(d.projectedBytesUsed).toBe(CAP + 800);
		// only the 800 bytes above the cap are overage
		expect(d.overageBytes).toBe(800);
	});

	test("counts the whole upload as overage when already over the cap", () => {
		const d = computeUploadDecision(
			state({ bytesUsed: CAP + 5_000, overageOptIn: true }),
			3_000,
		);
		expect(d.allowed).toBe(true);
		expect(d.reason).toBe("overage_accrued");
		expect(d.overageBytes).toBe(3_000);
	});
});

describe("overQuotaBytes", () => {
	test("is 0 at or under the cap", () => {
		expect(overQuotaBytes({ bytesUsed: CAP, quotaBytes: CAP })).toBe(0);
		expect(overQuotaBytes({ bytesUsed: 5, quotaBytes: CAP })).toBe(0);
	});

	test("is the excess above the cap", () => {
		expect(overQuotaBytes({ bytesUsed: CAP + 123, quotaBytes: CAP })).toBe(123);
	});
});

describe("dailyOverageRox", () => {
	test("is 0 when not over quota", () => {
		expect(dailyOverageRox(0)).toBe(0);
	});

	test("prorates the monthly GB rate to one day", () => {
		// 30 GB over, default rate, 30-day month => 30 * rate / 30 = rate Rox/day.
		const rox = dailyOverageRox(
			30 * BYTES_PER_GB,
			DEFAULT_DRIVE_OVERAGE_ROX_PER_GB_MONTH,
			30,
		);
		expect(rox).toBeCloseTo(DEFAULT_DRIVE_OVERAGE_ROX_PER_GB_MONTH, 6);
	});

	test("scales linearly with over-quota bytes", () => {
		const one = dailyOverageRox(1 * BYTES_PER_GB, 30, 30);
		const ten = dailyOverageRox(10 * BYTES_PER_GB, 30, 30);
		expect(ten).toBeCloseTo(one * 10, 6);
	});

	test("returns 0 for a zero rate", () => {
		expect(dailyOverageRox(50 * BYTES_PER_GB, 0)).toBe(0);
	});
});

describe("clampDecrement", () => {
	test("subtracts the file size when it fits", () => {
		expect(clampDecrement(1_000, 400)).toBe(400);
	});

	test("never lets the counter go negative", () => {
		expect(clampDecrement(300, 1_000)).toBe(300);
	});

	test("treats negatives defensively as 0", () => {
		expect(clampDecrement(-5, 10)).toBe(0);
		expect(clampDecrement(10, -5)).toBe(0);
	});
});
