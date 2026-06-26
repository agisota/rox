/**
 * Mail outbound lifecycle tunables (D3 / M3 + M5).
 *
 * Centralizes the spam-cannon gate constants the {@link mailRouter} enforces on
 * every outbound send so the policy lives in one place (and the test asserts
 * against the same source of truth):
 *
 *  - MAIL_SEND_COST_ROX  — Rox debited from the WS-E ledger per outbound send.
 *  - MAIL_SEND_RATE_MAX / MAIL_SEND_RATE_WINDOW_MS — per-user send-rate cap.
 *  - MAIL_PRESIGN_TTL_SECONDS — short TTL for the M5 body/attachment GET URLs.
 *
 * The rate cap counts a user's recent outbound `mail_messages` rows inside the
 * window — no new table needed; `created_at` already records when each send
 * landed.
 */

/** Rox cost debited per outbound send (M3 — makes the gate actually decrement). */
export const MAIL_SEND_COST_ROX = 1;

/** Max outbound sends a single user may make within {@link MAIL_SEND_RATE_WINDOW_MS}. */
export const MAIL_SEND_RATE_MAX = 20;

/** Rolling rate window in ms (per-user send cap). */
export const MAIL_SEND_RATE_WINDOW_MS = 60_000;

/** TTL (seconds) for M5 presigned body/attachment GET URLs — short by design. */
export const MAIL_PRESIGN_TTL_SECONDS = 300;

/** TTL (seconds) for the FN-141 presigned attachment PUT — short upload window. */
export const MAIL_PRESIGN_PUT_TTL_SECONDS = 600;

/** Default page size for the FN-138 `mail.search` FTS results. */
export const MAIL_SEARCH_DEFAULT_LIMIT = 25;

/** Max bytes for a single outbound attachment (FN-141). Mirrors common provider caps. */
export const MAIL_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Max number of drafts a single user may keep server-side (FN-139 guardrail). */
export const MAIL_DRAFTS_MAX_PER_USER = 200;
