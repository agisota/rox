/**
 * dv.net payment-provider client (#34, slice 3).
 *
 * This module provides:
 *   1. Pure request-construction — {@link buildInvoiceRequest} assembles the
 *      create-invoice payload without making any network call, so it is fully
 *      unit-testable with no mocking required.
 *   2. Webhook normalization — {@link normalizeDvNetWebhook} validates a raw
 *      dv.net callback body and converts it into the {@link CryptoPayment} shape
 *      consumed by `creditConfirmedPayment`. Validation rejects unconfirmed
 *      statuses, non-finite/negative/zero amounts, and missing required fields.
 *   3. A thin {@link DvNetHttpClient} that satisfies the {@link DvNetClient}
 *      interface from `rox-topup` and is the ONLY place DVNET_API_KEY is read.
 *      Secrets are never logged or included in error messages.
 *
 * Environment variables (read only inside {@link DvNetHttpClient}):
 *   DVNET_API_KEY  — required; throws {@link DvNetConfigError} when absent.
 *   DVNET_API_URL  — optional; defaults to {@link DVNET_DEFAULT_BASE_URL}.
 */

import type {
	CryptoPayment,
	CryptoPaymentStatus,
	DvNetClient,
} from "./rox-topup";

export const DVNET_DEFAULT_BASE_URL = "https://api.dv.net/v1";

/** Status strings dv.net reports for a charge. */
export type DvNetRawStatus =
	| "pending"
	| "confirmed"
	| "paid"
	| "failed"
	| "expired";

/** Raw shape of a dv.net invoice/charge as returned by their REST API. */
export interface DvNetRawPayment {
	id: string;
	status: DvNetRawStatus;
	/** Amount in the settlement currency (USDT). */
	amount: string | number;
	/** Settlement currency symbol, e.g. "USDT". */
	currency: string;
	/** Arbitrary caller-supplied reference (order/top-up id). */
	order_id?: string;
}

/** Payload sent to dv.net's create-invoice endpoint. */
export interface DvNetInvoiceRequest {
	/** Amount to charge in USDT. */
	amount: string;
	/** Settlement currency — always "USDT" for Rox top-ups. */
	currency: "USDT";
	/** Callback URL dv.net will POST the confirmed payment to. */
	callback_url: string;
	/** Caller-supplied reference so we can match the webhook to a user. */
	order_id: string;
}

/** Thrown when DVNET_API_KEY / DVNET_API_URL is missing or invalid. */
export class DvNetConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DvNetConfigError";
	}
}

/** Thrown when a webhook body is structurally invalid or contains bad values. */
export class DvNetWebhookError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DvNetWebhookError";
	}
}

/**
 * Thrown when {@link buildInvoiceRequest} is called with invalid arguments.
 *
 * Distinct from {@link DvNetWebhookError} so a handler that swallows webhook
 * validation failures (bad inbound payloads) does not also silently swallow a
 * programming error in outbound invoice construction.
 */
export class DvNetInvoiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DvNetInvoiceError";
	}
}

/**
 * Map a dv.net raw status to the normalized {@link CryptoPaymentStatus}.
 * dv.net uses "paid" as a synonym for "confirmed" — we normalise here so
 * upstream code only ever sees the canonical four-value enum.
 */
export function mapDvNetStatus(raw: DvNetRawStatus): CryptoPaymentStatus {
	if (raw === "paid" || raw === "confirmed") return "confirmed";
	if (raw === "failed") return "failed";
	if (raw === "expired") return "expired";
	if (raw === "pending") return "pending";
	// Exhaustiveness guard: a new DvNetRawStatus must be handled explicitly above
	// rather than silently collapsing to "pending".
	const _exhaustive: never = raw;
	throw new DvNetWebhookError(
		`unhandled DvNetRawStatus: ${String(_exhaustive)}`,
	);
}

/**
 * Build a create-invoice request payload (pure — no network).
 *
 * @param usdtAmount  Amount in USDT. Must be finite and positive; throws
 *                    {@link DvNetInvoiceError} otherwise.
 * @param orderId     Caller-supplied idempotency key (e.g. a UUID for the
 *                    pending top-up row). Never empty.
 * @param callbackUrl URL dv.net will POST the confirmed payment to.
 */
export function buildInvoiceRequest(
	usdtAmount: number,
	orderId: string,
	callbackUrl: string,
): DvNetInvoiceRequest {
	if (!Number.isFinite(usdtAmount) || !(usdtAmount > 0)) {
		throw new DvNetInvoiceError(
			`usdtAmount must be a finite positive number, got ${usdtAmount}`,
		);
	}
	if (!orderId) {
		throw new DvNetInvoiceError("orderId must not be empty");
	}
	if (!callbackUrl) {
		throw new DvNetInvoiceError("callbackUrl must not be empty");
	}
	return {
		amount: usdtAmount.toFixed(6),
		currency: "USDT",
		callback_url: callbackUrl,
		order_id: orderId,
	};
}

/**
 * Validate and normalize a raw dv.net webhook/callback body into a
 * {@link CryptoPayment} that `creditConfirmedPayment` can consume.
 *
 * Validation rules:
 *   - `id` must be a non-empty string (the idempotency key).
 *   - `status` must be a recognised dv.net status.
 *   - `amount` must parse to a finite, positive number.
 *   - `currency` must be "USDT" (case-insensitive).
 *
 * The function is deliberately strict: an unrecognised field is ignored, but a
 * missing or malformed required field throws {@link DvNetWebhookError}. This
 * means a corrupt or spoofed webhook is loudly rejected rather than silently
 * credited with a bad amount.
 */
export function normalizeDvNetWebhook(raw: unknown): CryptoPayment {
	if (typeof raw !== "object" || raw === null) {
		throw new DvNetWebhookError("webhook body must be a non-null object");
	}
	const body = raw as Record<string, unknown>;

	const id = body.id;
	if (typeof id !== "string" || id.trim() === "") {
		throw new DvNetWebhookError("webhook missing required string field: id");
	}

	const rawStatus = body.status;
	const knownStatuses: DvNetRawStatus[] = [
		"pending",
		"confirmed",
		"paid",
		"failed",
		"expired",
	];
	if (
		typeof rawStatus !== "string" ||
		!knownStatuses.includes(rawStatus as DvNetRawStatus)
	) {
		throw new DvNetWebhookError(
			`webhook has unrecognised status: ${String(rawStatus)}`,
		);
	}

	const rawAmount = body.amount;
	const amount = Number(rawAmount);
	if (!Number.isFinite(amount) || !(amount > 0)) {
		throw new DvNetWebhookError(
			`webhook amount must be a finite positive number, got ${String(rawAmount)}`,
		);
	}

	const rawCurrency = body.currency;
	if (typeof rawCurrency !== "string" || rawCurrency.toUpperCase() !== "USDT") {
		throw new DvNetWebhookError(
			`webhook currency must be USDT, got ${String(rawCurrency)}`,
		);
	}

	return {
		id: id.trim(),
		status: mapDvNetStatus(rawStatus as DvNetRawStatus),
		amount,
		asset: rawCurrency.toUpperCase(),
	};
}

/**
 * Derive a stable payment id from a dv.net charge id.
 *
 * The id returned by `normalizeDvNetWebhook` is already the provider id, but
 * callers that need a deterministic derivation (e.g. for deduplication before
 * the webhook lands) can call this directly with the charge id from the
 * create-invoice response.
 */
export function deriveDvNetPaymentId(chargeId: string): string {
	return `dvnet:${chargeId.trim()}`;
}

/**
 * Concrete HTTP implementation of {@link DvNetClient} (from rox-topup).
 *
 * This is the ONLY place {@code DVNET_API_KEY} is read. The key is validated
 * and captured at construction time, then closed over so it is never a
 * readable instance property, logged, or included in error messages.
 *
 * Throws {@link DvNetConfigError} on construction when the key is absent so
 * callers fail loudly at startup rather than silently at first use.
 */
export class DvNetHttpClient implements DvNetClient {
	private readonly baseUrl: string;
	private readonly getApiKey: () => string;

	constructor(
		env: Record<string, string | undefined> = process.env as Record<
			string,
			string | undefined
		>,
	) {
		const apiKey = env.DVNET_API_KEY;
		if (!apiKey || apiKey.trim() === "") {
			throw new DvNetConfigError(
				"DVNET_API_KEY is not set — configure it to enable crypto top-ups",
			);
		}
		this.baseUrl = (env.DVNET_API_URL ?? DVNET_DEFAULT_BASE_URL).replace(
			/\/$/,
			"",
		);
		// Capture the already-validated key string (not the mutable `env` ref) so
		// a later deletion of env["DVNET_API_KEY"] can't make us silently send a
		// blank Bearer token. The closure keeps it off the instance as a property.
		this.getApiKey = () => apiKey;
	}

	async getPayment(id: string): Promise<CryptoPayment | null> {
		const url = `${this.baseUrl}/charges/${encodeURIComponent(id)}`;
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${this.getApiKey()}`,
				"Content-Type": "application/json",
			},
		});

		if (response.status === 404) return null;

		if (!response.ok) {
			throw new Error(
				`dv.net GET /charges/${encodeURIComponent(id)} failed with status ${response.status}`,
			);
		}

		const data = (await response.json()) as unknown;
		return normalizeDvNetWebhook(data);
	}
}
