/**
 * Whether the local chat-session row may be removed for a given upstream
 * stream-delete status.
 *
 * The DB row is only dropped once the durable stream is actually gone, so the
 * two stores cannot drift apart. A 2xx means the stream was deleted; a 404
 * means it was already gone (idempotent retry) and is treated as success. Any
 * other status (4xx/5xx) keeps the row so the delete can be retried.
 */
export function upstreamDeleteSucceeded(status: number): boolean {
	return (status >= 200 && status < 300) || status === 404;
}
