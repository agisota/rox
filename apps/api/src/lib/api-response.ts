/**
 * Build a JSON error response with a stable `{ error, ...extra }` shape.
 *
 * Centralizes the hand-built `Response.json({ error }, { status })` pattern used
 * across webhook and sync routes so the error body shape stays consistent.
 */
export function apiError(
	message: string,
	status: number,
	extra?: Record<string, unknown>,
): Response {
	return Response.json({ error: message, ...extra }, { status });
}
