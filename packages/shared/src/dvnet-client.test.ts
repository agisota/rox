import { afterEach, describe, expect, it } from "bun:test";
import {
	buildInvoiceRequest,
	DvNetConfigError,
	DvNetHttpClient,
	DvNetInvoiceError,
	DvNetWebhookError,
	deriveDvNetPaymentId,
	mapDvNetStatus,
	normalizeDvNetWebhook,
} from "./dvnet-client";
import { creditConfirmedPayment } from "./rox-topup";

// ---------------------------------------------------------------------------
// mapDvNetStatus
// ---------------------------------------------------------------------------

describe("mapDvNetStatus", () => {
	it("maps 'confirmed' and 'paid' to confirmed", () => {
		expect(mapDvNetStatus("confirmed")).toBe("confirmed");
		expect(mapDvNetStatus("paid")).toBe("confirmed");
	});

	it("maps other statuses through unchanged", () => {
		expect(mapDvNetStatus("pending")).toBe("pending");
		expect(mapDvNetStatus("failed")).toBe("failed");
		expect(mapDvNetStatus("expired")).toBe("expired");
	});
});

// ---------------------------------------------------------------------------
// buildInvoiceRequest
// ---------------------------------------------------------------------------

describe("buildInvoiceRequest", () => {
	it("builds a valid USDT invoice request", () => {
		const req = buildInvoiceRequest(
			5,
			"order-abc-123",
			"https://example.com/cb",
		);
		expect(req).toEqual({
			amount: "5.000000",
			currency: "USDT",
			callback_url: "https://example.com/cb",
			order_id: "order-abc-123",
		});
	});

	it("formats amounts with 6 decimal places", () => {
		const req = buildInvoiceRequest(10.5, "ord-1", "https://cb.example.com");
		expect(req.amount).toBe("10.500000");
	});

	it("rejects zero amount", () => {
		expect(() =>
			buildInvoiceRequest(0, "ord-1", "https://example.com/cb"),
		).toThrow(DvNetInvoiceError);
	});

	it("rejects negative amount", () => {
		expect(() =>
			buildInvoiceRequest(-5, "ord-1", "https://example.com/cb"),
		).toThrow(DvNetInvoiceError);
	});

	it("rejects NaN amount", () => {
		expect(() =>
			buildInvoiceRequest(Number.NaN, "ord-1", "https://example.com/cb"),
		).toThrow(DvNetInvoiceError);
	});

	it("rejects Infinity amount", () => {
		expect(() =>
			buildInvoiceRequest(
				Number.POSITIVE_INFINITY,
				"ord-1",
				"https://example.com/cb",
			),
		).toThrow(DvNetInvoiceError);
	});

	it("rejects empty orderId", () => {
		expect(() => buildInvoiceRequest(5, "", "https://example.com/cb")).toThrow(
			DvNetInvoiceError,
		);
	});

	it("rejects empty callbackUrl", () => {
		expect(() => buildInvoiceRequest(5, "ord-1", "")).toThrow(
			DvNetInvoiceError,
		);
	});

	it("rejects whitespace-only orderId", () => {
		expect(() =>
			buildInvoiceRequest(5, "   ", "https://example.com/cb"),
		).toThrow(DvNetInvoiceError);
	});

	it("rejects whitespace-only callbackUrl", () => {
		expect(() => buildInvoiceRequest(5, "ord-1", "  \t ")).toThrow(
			DvNetInvoiceError,
		);
	});

	it("trims surrounding whitespace from orderId and callbackUrl", () => {
		const req = buildInvoiceRequest(
			5,
			"  order-abc-123  ",
			"  https://example.com/cb  ",
		);
		expect(req.order_id).toBe("order-abc-123");
		expect(req.callback_url).toBe("https://example.com/cb");
	});
});

// ---------------------------------------------------------------------------
// normalizeDvNetWebhook
// ---------------------------------------------------------------------------

function validWebhook(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "chg_abc123",
		status: "confirmed",
		amount: "5.00",
		currency: "USDT",
		order_id: "order-1",
		...overrides,
	};
}

describe("normalizeDvNetWebhook — happy path", () => {
	it("normalizes a confirmed webhook to a CryptoPayment", () => {
		const payment = normalizeDvNetWebhook(validWebhook());
		expect(payment).toEqual({
			id: "chg_abc123",
			status: "confirmed",
			amount: 5,
			asset: "USDT",
		});
	});

	it("maps 'paid' status to confirmed", () => {
		const payment = normalizeDvNetWebhook(validWebhook({ status: "paid" }));
		expect(payment.status).toBe("confirmed");
	});

	it("normalizes lowercase currency to uppercase", () => {
		const payment = normalizeDvNetWebhook(validWebhook({ currency: "usdt" }));
		expect(payment.asset).toBe("USDT");
	});

	it("accepts amount as a number", () => {
		const payment = normalizeDvNetWebhook(validWebhook({ amount: 10 }));
		expect(payment.amount).toBe(10);
	});

	it("trims whitespace from id", () => {
		const payment = normalizeDvNetWebhook(
			validWebhook({ id: "  chg_abc123  " }),
		);
		expect(payment.id).toBe("chg_abc123");
	});

	it("ignores unknown extra fields", () => {
		const payment = normalizeDvNetWebhook(
			validWebhook({ extra_field: "ignored" }),
		);
		expect(payment.id).toBe("chg_abc123");
	});
});

describe("normalizeDvNetWebhook — rejects unconfirmed statuses", () => {
	for (const status of ["pending", "failed", "expired"] as const) {
		it(`maps '${status}' to non-confirmed CryptoPaymentStatus`, () => {
			const payment = normalizeDvNetWebhook(validWebhook({ status }));
			expect(payment.status).not.toBe("confirmed");
			expect(payment.status).toBe(status);
		});
	}
});

describe("normalizeDvNetWebhook — rejects invalid payloads", () => {
	it("rejects null body", () => {
		expect(() => normalizeDvNetWebhook(null)).toThrow(DvNetWebhookError);
	});

	it("rejects non-object body", () => {
		expect(() => normalizeDvNetWebhook("string")).toThrow(DvNetWebhookError);
	});

	it("rejects missing id", () => {
		const { id: _id, ...body } = validWebhook();
		expect(() => normalizeDvNetWebhook(body)).toThrow(DvNetWebhookError);
	});

	it("rejects empty id", () => {
		expect(() => normalizeDvNetWebhook(validWebhook({ id: "" }))).toThrow(
			DvNetWebhookError,
		);
	});

	it("rejects unknown status", () => {
		expect(() =>
			normalizeDvNetWebhook(validWebhook({ status: "processing" })),
		).toThrow(DvNetWebhookError);
	});

	it("rejects zero amount", () => {
		expect(() => normalizeDvNetWebhook(validWebhook({ amount: 0 }))).toThrow(
			DvNetWebhookError,
		);
	});

	it("rejects negative amount", () => {
		expect(() => normalizeDvNetWebhook(validWebhook({ amount: -1 }))).toThrow(
			DvNetWebhookError,
		);
	});

	it("rejects NaN amount", () => {
		expect(() =>
			normalizeDvNetWebhook(validWebhook({ amount: Number.NaN })),
		).toThrow(DvNetWebhookError);
	});

	it("rejects Infinity amount", () => {
		expect(() =>
			normalizeDvNetWebhook(validWebhook({ amount: Number.POSITIVE_INFINITY })),
		).toThrow(DvNetWebhookError);
	});

	it("rejects non-parseable string amount", () => {
		expect(() =>
			normalizeDvNetWebhook(validWebhook({ amount: "not-a-number" })),
		).toThrow(DvNetWebhookError);
	});

	it("rejects non-USDT currency", () => {
		expect(() =>
			normalizeDvNetWebhook(validWebhook({ currency: "BTC" })),
		).toThrow(DvNetWebhookError);
	});

	it("rejects missing currency", () => {
		const { currency: _currency, ...body } = validWebhook();
		expect(() => normalizeDvNetWebhook(body)).toThrow(DvNetWebhookError);
	});
});

// ---------------------------------------------------------------------------
// deriveDvNetPaymentId — stable, idempotent id derivation
// ---------------------------------------------------------------------------

describe("deriveDvNetPaymentId", () => {
	it("derives a stable prefixed id", () => {
		expect(deriveDvNetPaymentId("chg_abc123")).toBe("dvnet:chg_abc123");
	});

	it("is idempotent — same input always produces the same output", () => {
		const id = "chg_xyz";
		expect(deriveDvNetPaymentId(id)).toBe(deriveDvNetPaymentId(id));
	});

	it("trims whitespace from the charge id", () => {
		expect(deriveDvNetPaymentId("  chg_abc  ")).toBe("dvnet:chg_abc");
	});
});

// ---------------------------------------------------------------------------
// Integration: normalizeDvNetWebhook → creditConfirmedPayment
// ---------------------------------------------------------------------------

describe("normalizeDvNetWebhook → creditConfirmedPayment integration", () => {
	it("normalized confirmed payment can be credited", () => {
		const payment = normalizeDvNetWebhook(validWebhook({ amount: "5.00" }));
		const result = creditConfirmedPayment(0, payment, new Set());
		expect(result.credited).toBe(true);
		if (result.credited) {
			expect(result.rox).toBe(500);
			expect(result.balanceAfter).toBe(500);
		}
	});

	it("normalized pending payment is not credited", () => {
		const payment = normalizeDvNetWebhook(validWebhook({ status: "pending" }));
		const result = creditConfirmedPayment(100, payment, new Set());
		expect(result.credited).toBe(false);
		if (!result.credited) {
			expect(result.reason).toBe("not-confirmed");
		}
	});

	it("normalized 'paid' (dv.net synonym) payment is credited", () => {
		const payment = normalizeDvNetWebhook(validWebhook({ status: "paid" }));
		const result = creditConfirmedPayment(0, payment, new Set());
		expect(result.credited).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// DvNetHttpClient — configuration guard
// ---------------------------------------------------------------------------

describe("DvNetHttpClient", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("throws DvNetConfigError when DVNET_API_KEY is absent", () => {
		expect(() => new DvNetHttpClient({})).toThrow(DvNetConfigError);
	});

	it("throws DvNetConfigError when DVNET_API_KEY is empty string", () => {
		expect(() => new DvNetHttpClient({ DVNET_API_KEY: "" })).toThrow(
			DvNetConfigError,
		);
	});

	it("throws DvNetConfigError when DVNET_API_KEY is whitespace only", () => {
		expect(() => new DvNetHttpClient({ DVNET_API_KEY: "   " })).toThrow(
			DvNetConfigError,
		);
	});

	it("constructs successfully when DVNET_API_KEY is set", () => {
		expect(
			() => new DvNetHttpClient({ DVNET_API_KEY: "test-key-12345" }),
		).not.toThrow();
	});

	it("wraps timeout failures with dv.net request context", async () => {
		globalThis.fetch = (async () => {
			throw new DOMException("request timed out", "TimeoutError");
		}) as unknown as typeof fetch;

		const client = new DvNetHttpClient({ DVNET_API_KEY: "test-key-12345" });
		await expect(client.getPayment("chg_timeout")).rejects.toThrow(
			"dv.net GET /charges/chg_timeout timed out after 10000ms",
		);
	});

	it("createInvoice POSTs and returns the charge id + checkout URL", async () => {
		let captured: { url: string; init: RequestInit } | undefined;
		globalThis.fetch = (async (url: string, init: RequestInit) => {
			captured = { url, init };
			return new Response(
				JSON.stringify({ id: "chg_new", checkout_url: "https://pay.dv.net/x" }),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		const client = new DvNetHttpClient({
			DVNET_API_KEY: "test-key-12345",
			DVNET_API_URL: "https://api.dv.net/v1",
		});
		const result = await client.createInvoice(
			buildInvoiceRequest(5, "order-1", "https://example.com/cb"),
		);

		expect(result).toEqual({
			invoiceId: "chg_new",
			checkoutUrl: "https://pay.dv.net/x",
		});
		expect(captured?.url).toBe("https://api.dv.net/v1/charges");
		expect(captured?.init.method).toBe("POST");
	});

	it("createInvoice falls back to `url` when `checkout_url` is absent", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ id: "chg_2", url: "https://pay/y" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})) as unknown as typeof fetch;

		const client = new DvNetHttpClient({ DVNET_API_KEY: "k" });
		const result = await client.createInvoice(
			buildInvoiceRequest(1, "o", "https://cb"),
		);
		expect(result.checkoutUrl).toBe("https://pay/y");
	});

	it("createInvoice throws when the response has no charge id", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ checkout_url: "https://pay/z" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})) as unknown as typeof fetch;

		const client = new DvNetHttpClient({ DVNET_API_KEY: "k" });
		await expect(
			client.createInvoice(buildInvoiceRequest(1, "o", "https://cb")),
		).rejects.toThrow(DvNetInvoiceError);
	});

	it("createInvoice throws when the response has no checkout URL", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ id: "chg_3" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})) as unknown as typeof fetch;

		const client = new DvNetHttpClient({ DVNET_API_KEY: "k" });
		await expect(
			client.createInvoice(buildInvoiceRequest(1, "o", "https://cb")),
		).rejects.toThrow(DvNetInvoiceError);
	});

	it("createInvoice throws with context on a non-OK status", async () => {
		globalThis.fetch = (async () =>
			new Response("nope", { status: 500 })) as unknown as typeof fetch;

		const client = new DvNetHttpClient({ DVNET_API_KEY: "k" });
		await expect(
			client.createInvoice(buildInvoiceRequest(1, "o", "https://cb")),
		).rejects.toThrow("dv.net POST /charges failed with status 500");
	});
});
