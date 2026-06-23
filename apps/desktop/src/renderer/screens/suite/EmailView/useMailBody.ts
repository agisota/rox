import { useQuery } from "@tanstack/react-query";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

/** The resolved full body of a mail message: HTML (sanitized at render) or text. */
export interface MailBody {
	kind: "html" | "text";
	content: string;
}

/**
 * Fetch a mail message's full body from R2 in the Electron renderer (FEATURE A).
 * Mirrors the web hook: ask for the HTML variant first, fall back to text when no
 * HTML is stored, then fetch the short-TTL presigned URL and return the raw body.
 * The CALLER sanitizes HTML before injecting it (`sanitizeMailHtml`).
 *
 * Uses the vanilla cloud client (`apiTrpcClient`) since `getBodyUrl` is a mutation
 * and the fetch of the presigned URL is plain `fetch`. Cache-first via React
 * Query: the resolved body is cached per message id, an error surfaces as
 * `isError` so the reader can fall back to the snippet.
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

async function resolveBodyVariant(
	messageId: string,
): Promise<{ kind: "html" | "text"; url: string } | null> {
	try {
		const html = await apiTrpcClient.mail.getBodyUrl.mutate({
			messageId,
			variant: "html",
		});
		return { kind: "html", url: html.url };
	} catch {
		// No HTML stored (or presign failed) — fall back to the plaintext variant.
	}
	try {
		const text = await apiTrpcClient.mail.getBodyUrl.mutate({
			messageId,
			variant: "text",
		});
		return { kind: "text", url: text.url };
	} catch {
		return null;
	}
}
