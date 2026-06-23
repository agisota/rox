import { useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

interface UseMailMessageBodyResult {
	/** The full plaintext body once fetched, or null while loading / unavailable. */
	body: string | null;
	isLoading: boolean;
	error: string | null;
}

/**
 * Fetch a mail message's full PLAINTEXT body from R2 (FEATURE A, mobile).
 *
 * React Native has no DOM, so there is no DOMPurify and we never render HTML —
 * the text/plain variant is always safe to show as a `<Text>` child. The server
 * mints a short-TTL presigned GET (`mail.getBodyUrl`); we then fetch the bytes.
 * A missing body / presign error leaves `body` null so the caller falls back to
 * the snippet. Cache-first: the snippet keeps showing until the full body lands.
 */
export function useMailMessageBody(
	messageId: string,
): UseMailMessageBodyResult {
	const [body, setBody] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);

		(async () => {
			try {
				const { url } = await apiClient.mail.getBodyUrl.mutate({
					messageId,
					variant: "text",
				});
				const res = await fetch(url);
				if (!res.ok) throw new Error(`Body fetch failed (${res.status})`);
				const text = await res.text();
				if (!cancelled) setBody(text);
			} catch (err) {
				if (!cancelled) {
					// NOT_FOUND (no stored text body) is expected for some messages —
					// surface nothing and let the caller show the snippet.
					setError(err instanceof Error ? err.message : "Failed to load body");
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [messageId]);

	return { body, isLoading, error };
}
