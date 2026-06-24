import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";

export interface ComposeMailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * New-email compose dialog for the inbox top bar. Reuses the mail surface's
 * `mail.send` contract (recipients split on `[,;\s]+`, optional subject) so a
 * message sent here lands in the same mailbox the inbox reads; on success it
 * invalidates `mail.listThreads` so the new outbound thread appears (cache-first).
 */
export function ComposeMailDialog({
	open,
	onOpenChange,
}: ComposeMailDialogProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [to, setTo] = useState("");
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");

	const send = useMutation(
		trpc.mail.send.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.mail.listThreads.queryKey({ limit: 50 }),
				});
				onOpenChange(false);
				setTo("");
				setSubject("");
				setBody("");
				toast.success("Письмо отправлено");
			},
			onError: (error) => {
				logger.error("[InboxView] mail send failed", error);
				toast.error(error.message || "Не удалось отправить письмо");
			},
		}),
	);

	const handleSend = () => {
		const recipients = to
			.split(/[,;\s]+/)
			.map((v) => v.trim())
			.filter(Boolean);
		if (recipients.length === 0 || !body.trim()) return;
		send.mutate({
			to: recipients,
			subject: subject.trim() || undefined,
			body,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[min(720px,calc(100dvh-2rem))] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Новое письмо</DialogTitle>
					<DialogDescription>
						Отправка с вашего адреса @rox.one.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="inbox-mail-to">Кому</Label>
						<Input
							id="inbox-mail-to"
							value={to}
							onChange={(e) => setTo(e.target.value)}
							placeholder="name@example.com, …"
							type="email"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="inbox-mail-subject">Тема</Label>
						<Input
							id="inbox-mail-subject"
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							placeholder="Тема письма"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="inbox-mail-body">Текст</Label>
						<Textarea
							id="inbox-mail-body"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							placeholder="Текст письма…"
							rows={8}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={!to.trim() || !body.trim() || send.isPending}
						onClick={handleSend}
					>
						<Send className="size-4" /> Отправить
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
