export type MonadStatus =
	| "resting"
	| "transition"
	| "verified"
	| "warn"
	| "error";

/** Maps a MONAD state to its semantic colour token (see tokens.css). */
export const statusColor: Record<MonadStatus, string> = {
	resting: "var(--monad-resting)",
	transition: "var(--monad-transition)",
	verified: "var(--monad-verified)",
	warn: "var(--monad-warn)",
	error: "var(--monad-error)",
};
