/**
 * @rox/comms-core/email — pure D3 email helpers (no db, no provider).
 *
 * Inbound spam scoring + the email transport types. The {@link EmailAdapter}
 * itself lives under `../adapter` (it is a {@link TransportAdapter}); this
 * barrel re-exports it so the email-specific surface is importable from one
 * place.
 */

export {
	EmailAdapter,
	type EmailAdapterOptions,
	type EmailAuthResult,
	type EmailAuthVerdict,
	type EmailInboundAttachment,
	type EmailOutboundPayload,
	type EmailRawInbound,
	normalizeSubject,
	type ResendSendFn,
} from "../adapter/EmailAdapter";
export {
	type AuthVerdict,
	DEFAULT_SPAM_THRESHOLD,
	type SpamAuthSignals,
	type SpamContentSignals,
	type SpamScoreInput,
	type SpamScoreResult,
	scoreInboundSpam,
} from "./spamScore";
