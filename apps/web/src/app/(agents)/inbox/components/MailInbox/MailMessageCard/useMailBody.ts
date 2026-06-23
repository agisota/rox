"use client";

import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "@/trpc/client";

/** The resolved full body of a mail message: HTML (sanitized at render) or text. */
export interface MailBody {
	kind: "html" | "text";
	content: string;
}

/**
 * Fetch a mail message's full body from R2 (FEATURE A).
 *
 * The server only mints short-TTL presigned GETs (`mail.getBodyUrl`); the bytes
 * live in R2, not in the row. So this hook: asks for the HTML variant first and,
 * if the message has no stored HTML (NOT_FOUND), falls back to the text variant,
 * then fetches the presigned URL and returns the raw body. The CALLER sanitizes
 * HTML before injecting it (`sanitizeMailHtml`) — this hook returns raw bytes.
 *
 * Cache-first: `enabled` gates the fetch to expanded cards; React Query keeps the
 * resolved body cached per message id so re-expanding is instant. A presign error
 * surfaces as `isError` so the card can show a fallback instead of a blank body.
 */
export function useMailBody(messageId: string, enabled: boolean) {
	return useQuery<MailBody | null>({
		queryKey: ["mail", "body", messageId],
		enabled,
		staleTime: 60_000,
		queryFn: async () => {
			const variant = await resolveBodyVariant(messageId);
			if (!variant) return null;
			const res = await fetch(variant.url);
			if (!res.ok) {
				throw new Error(`Body fetch failed (${res.status})`);
			}
			const content = await res.text();
			return { kind: variant.kind, content };
		},
	});
}

/**
 * Resolve a presigned URL for the message body, preferring the HTML variant and
 * falling back to text when the message has no stored HTML. Returns `null` when
 * neither variant exists.
 */
async function resolveBodyVariant(
	messageId: string,
): Promise<{ kind: "html" | "text"; url: string } | null> {
	try {
		const html = await trpcClient.mail.getBodyUrl.mutate({
			messageId,
			variant: "html",
		});
		return { kind: "html", url: html.url };
	} catch {
		// No HTML stored (or presign failed) — fall back to the plaintext variant.
	}
	try {
		const text = await trpcClient.mail.getBodyUrl.mutate({
			messageId,
			variant: "text",
		});
		return { kind: "text", url: text.url };
	} catch {
		return null;
	}
}
