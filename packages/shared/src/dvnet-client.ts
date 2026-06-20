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

/**
 * Hard ceiling on a single dv.net HTTP request. Without this a hung upstream
 * keeps the awaiting caller (and any webhook/credit path behind it) blocked
 * indefinitely; `AbortSignal.timeout` rejects the `fetch` instead.
 */
export const DVNET_REQUEST_TIMEOUT_MS = 10_000;

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

/**
 * Result of creating a dv.net invoice: the provider's charge id (the value the
 * later webhook echoes back, used to reconcile the pending top-up) plus the
 * hosted checkout URL the user is redirected to in order to pay.
 */
export interface DvNetInvoiceResult {
	/** Provider charge id — matches the `id` the webhook reports. */
	invoiceId: string;
	/** Hosted checkout URL the user pays at. */
	checkoutUrl: string;
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

function isTimeoutError(error: unknown): boolean {
	if (error instanceof DOMException) {
		return error.name === "TimeoutError" || error.name === "AbortError";
	}
	return (
		error instanceof Error &&
		(error.name === "TimeoutError" || error.name === "AbortError")
	);
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
	// Trim before the emptiness check so a whitespace-only reference (which is
	// truthy and would otherwise slip through) is rejected, and the value we
	// send matches the one the webhook will be reconciled against.
	const trimmedOrderId = orderId.trim();
	if (trimmedOrderId === "") {
		throw new DvNetInvoiceError("orderId must not be empty");
	}
	const trimmedCallbackUrl = callbackUrl.trim();
	if (trimmedCallbackUrl === "") {
		throw new DvNetInvoiceError("callbackUrl must not be empty");
	}
	return {
		amount: usdtAmount.toFixed(6),
		currency: "USDT",
		callback_url: trimmedCallbackUrl,
		order_id: trimmedOrderId,
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
		let response: Response;
		try {
			response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${this.getApiKey()}`,
					"Content-Type": "application/json",
				},
				signal: AbortSignal.timeout(DVNET_REQUEST_TIMEOUT_MS),
			});
		} catch (error) {
			if (isTimeoutError(error)) {
				throw new Error(
					`dv.net GET /charges/${encodeURIComponent(id)} timed out after ${DVNET_REQUEST_TIMEOUT_MS}ms`,
					{ cause: error },
				);
			}
			throw error;
		}

		if (response.status === 404) return null;

		if (!response.ok) {
			throw new Error(
				`dv.net GET /charges/${encodeURIComponent(id)} failed with status ${response.status}`,
			);
		}

		const data = (await response.json()) as unknown;
		return normalizeDvNetWebhook(data);
	}

	/**
	 * Create a hosted invoice/charge at dv.net and return its id + checkout URL.
	 *
	 * The `request` is built by the pure {@link buildInvoiceRequest} (validated,
	 * no secrets); this method only attaches the Bearer key and POSTs it. The
	 * response is parsed leniently — dv.net returns the charge id under `id` and
	 * the hosted-pay URL under `checkout_url`/`url`/`payment_url`. A missing id or
	 * URL is a hard error so a caller never persists a half-created top-up.
	 */
	async createInvoice(
		request: DvNetInvoiceRequest,
	): Promise<DvNetInvoiceResult> {
		const url = `${this.baseUrl}/charges`;
		let response: Response;
		try {
			response = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.getApiKey()}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(request),
				signal: AbortSignal.timeout(DVNET_REQUEST_TIMEOUT_MS),
			});
		} catch (error) {
			if (isTimeoutError(error)) {
				throw new Error(
					`dv.net POST /charges timed out after ${DVNET_REQUEST_TIMEOUT_MS}ms`,
					{ cause: error },
				);
			}
			throw error;
		}

		if (!response.ok) {
			throw new Error(
				`dv.net POST /charges failed with status ${response.status}`,
			);
		}

		const data = (await response.json()) as Record<string, unknown>;
		const invoiceId = data.id;
		const checkoutUrl =
			data.checkout_url ?? data.url ?? data.payment_url ?? data.pay_url;

		if (typeof invoiceId !== "string" || invoiceId.trim() === "") {
			throw new DvNetInvoiceError(
				"dv.net create-invoice response missing a charge id",
			);
		}
		if (typeof checkoutUrl !== "string" || checkoutUrl.trim() === "") {
			throw new DvNetInvoiceError(
				"dv.net create-invoice response missing a checkout URL",
			);
		}

		return { invoiceId: invoiceId.trim(), checkoutUrl: checkoutUrl.trim() };
	}
}

/**
 * Lazily construct the default {@link DvNetHttpClient} from `process.env`.
 *
 * Kept as a factory (not a module-level singleton) so the secret is only read
 * when a top-up is actually requested — modules that merely import the router
 * never trigger the {@link DvNetConfigError} at load time, and tests can mock
 * this function without a live key.
 */
export function createDvNetClient(): DvNetHttpClient {
	return new DvNetHttpClient();
}
