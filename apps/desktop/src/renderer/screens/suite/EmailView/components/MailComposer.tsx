import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Textarea } from "@rox/ui/textarea";
import { Send, TriangleAlert, X } from "lucide-react";
import { useId, useState } from "react";

/** The editable fields of one composed message. */
export interface MailDraft {
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	body: string;
}

export const EMPTY_DRAFT: MailDraft = {
	to: "",
	cc: "",
	bcc: "",
	subject: "",
	body: "",
};

export interface MailComposerProps {
	draft: MailDraft;
	onChange: (next: MailDraft) => void;
	onSend: () => void;
	onCancel?: () => void;
	sending: boolean;
	/** Resend outbound is gated off server-side (`PRECONDITION_FAILED`). */
	outboundDisabled: boolean;
	/** Title above the form (e.g. "Новое письмо" / "Ответ"). */
	title?: string;
}

/** Split a raw recipient field into trimmed, de-duplicated addresses. */
export function parseRecipients(raw: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of raw.split(/[,;\s]+/)) {
		const addr = part.trim();
		if (!addr) continue;
		const key = addr.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(addr);
	}
	return out;
}

/**
 * Inline mail composer (P0: plaintext `Textarea`). Used both for a brand-new
 * message and for an inline reply prefilled from `buildMailReplyContext`. Cc/Bcc
 * are collapsed behind a toggle. `⌘↵` / `Ctrl+↵` sends. When Resend is disabled
 * server-side a persistent amber banner explains why and the send button is
 * inert — the form still composes so a draft is never lost.
 */
export function MailComposer({
	draft,
	onChange,
	onSend,
	onCancel,
	sending,
	outboundDisabled,
	title = "Новое письмо",
}: MailComposerProps) {
	const [showCc, setShowCc] = useState(
		() => draft.cc.length > 0 || draft.bcc.length > 0,
	);
	const ids = useId();

	const canSend =
		!sending &&
		!outboundDisabled &&
		parseRecipients(draft.to).length > 0 &&
		draft.body.trim().length > 0;

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			if (canSend) onSend();
		}
	};

	const set = (patch: Partial<MailDraft>) => onChange({ ...draft, ...patch });

	return (
		// A real <form> (not a static element) carries the ⌘↵ keydown so any field
		// inside can send; native submit is suppressed since we send explicitly.
		<form
			className="flex flex-col gap-2.5 rounded-lg border border-border/70 bg-card/80 p-3"
			onKeyDown={handleKeyDown}
			onSubmit={(e) => e.preventDefault()}
		>
			<header className="flex items-center justify-between">
				<span className="font-medium text-sm">{title}</span>
				{onCancel && (
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-6"
						onClick={onCancel}
						aria-label="Закрыть композер"
					>
						<X className="size-3.5" />
					</Button>
				)}
			</header>

			{outboundDisabled && (
				<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-amber-300 text-xs">
					<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
					<span>
						Отправка почты сейчас отключена. Письмо можно подготовить, но не
						отправить.
					</span>
				</div>
			)}

			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<Label
						htmlFor={`${ids}-to`}
						className="w-10 shrink-0 text-muted-foreground text-xs"
					>
						Кому
					</Label>
					<Input
						id={`${ids}-to`}
						value={draft.to}
						onChange={(e) => set({ to: e.target.value })}
						placeholder="name@example.com, …"
						className="h-8 font-mono text-xs"
					/>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground"
						onClick={() => setShowCc((v) => !v)}
					>
						Копия/СК
					</Button>
				</div>

				{showCc && (
					<>
						<div className="flex items-center gap-2">
							<Label
								htmlFor={`${ids}-cc`}
								className="w-10 shrink-0 text-muted-foreground text-xs"
							>
								Копия
							</Label>
							<Input
								id={`${ids}-cc`}
								value={draft.cc}
								onChange={(e) => set({ cc: e.target.value })}
								placeholder="cc@example.com"
								className="h-8 font-mono text-xs"
							/>
						</div>
						<div className="flex items-center gap-2">
							<Label
								htmlFor={`${ids}-bcc`}
								className="w-10 shrink-0 text-muted-foreground text-xs"
							>
								СК
							</Label>
							<Input
								id={`${ids}-bcc`}
								value={draft.bcc}
								onChange={(e) => set({ bcc: e.target.value })}
								placeholder="bcc@example.com"
								className="h-8 font-mono text-xs"
							/>
						</div>
					</>
				)}

				<div className="flex items-center gap-2">
					<Label
						htmlFor={`${ids}-subject`}
						className="w-10 shrink-0 text-muted-foreground text-xs"
					>
						Тема
					</Label>
					<Input
						id={`${ids}-subject`}
						value={draft.subject}
						onChange={(e) => set({ subject: e.target.value })}
						placeholder="Тема письма"
						className="h-8 text-xs"
					/>
				</div>
			</div>

			<Textarea
				value={draft.body}
				onChange={(e) => set({ body: e.target.value })}
				placeholder="Текст письма…"
				rows={6}
				className="resize-y font-mono text-xs"
			/>

			<footer className="flex items-center justify-between">
				<span className="text-[10px] text-muted-foreground">
					⌘↵ — отправить
				</span>
				<Button type="button" size="sm" disabled={!canSend} onClick={onSend}>
					<Send className="size-3.5" /> Отправить
				</Button>
			</footer>
		</form>
	);
}
