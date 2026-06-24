import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { Letter } from "react-letter";
import { sanitizeMailHtml } from "../sanitizeMailHtml";

/** A 1×1 transparent gif — the placeholder a blocked remote resource resolves to. */
const BLOCKED_PIXEL =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export interface MailHtmlContentProps {
	/** Raw HTML body fetched from R2 (already untrusted). */
	html: string;
	/** Subject, used as the iframe title for a11y. */
	subject?: string | null;
}

/**
 * Safe renderer for an inbound email's HTML body (security-critical).
 *
 * Defense in depth, in order:
 *  1. `sanitizeMailHtml` (DOMPurify) strips scripts, event handlers, `<form>`,
 *     `<style>`, and inline styles BEFORE the markup is ever mounted.
 *  2. `react-letter`'s `<Letter useIframe>` re-parses + re-sanitizes the result
 *     and renders it inside a same-origin sandbox iframe, so the message's CSS
 *     can never leak into (or restyle) the app chrome.
 *  3. Remote resources are blocked by default — `rewriteExternalResources`
 *     swaps every external `src`/`url(...)` for a transparent pixel until the
 *     user explicitly opts in via "Показать изображения" (privacy: a tracking
 *     pixel can't phone home on open). `cid:`/`data:` inline parts are kept.
 *  4. Links are rewritten to drop opener access; the sanitizer already forced
 *     `target="_blank" rel="noopener noreferrer"`.
 *
 * The presigned R2 URL itself is never logged (spec security invariant).
 */
export function MailHtmlContent({ html, subject }: MailHtmlContentProps) {
	const [showImages, setShowImages] = useState(false);

	// First pass: our own DOMPurify policy (shared with the web inbox).
	const sanitized = sanitizeMailHtml(html);

	// Heuristic: only offer the toggle when the message actually references a
	// remote resource, so a plain-text-ish HTML mail doesn't get a noisy banner.
	const hasRemote =
		/(?:src|background)\s*=\s*["']?https?:|url\(\s*["']?https?:/i.test(
			sanitized,
		);

	const rewriteExternalResources = (url: string): string => {
		if (showImages) return url;
		// Keep inline + data parts; block anything that would hit the network.
		if (/^(?:cid:|data:)/i.test(url)) return url;
		return BLOCKED_PIXEL;
	};

	return (
		<div className="mail-html-content">
			{hasRemote && !showImages && (
				<div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5">
					<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<ImageOff className="size-3.5 shrink-0" />
						Изображения скрыты для защиты приватности
					</span>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 shrink-0 px-2 text-[11px]"
						onClick={() => setShowImages(true)}
					>
						Показать изображения
					</Button>
				</div>
			)}
			<Letter
				html={sanitized}
				useIframe
				iframeTitle={subject?.trim() || "Письмо"}
				rewriteExternalResources={rewriteExternalResources}
				rewriteExternalLinks={(url) => url}
				allowedSchemas={["http", "https", "mailto", "tel", "cid", "data"]}
				className={cn(
					"mail-letter max-h-[60vh] overflow-auto text-sm",
					"[&_iframe]:w-full [&_iframe]:min-h-24",
				)}
			/>
		</div>
	);
}
