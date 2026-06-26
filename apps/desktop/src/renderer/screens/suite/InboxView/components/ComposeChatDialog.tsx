import {
	buildChatDraft,
	type ComposeChatMember,
	filterMembers,
	memberLabel,
	toggleRecipient,
} from "@rox/comms-core";
import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Button } from "@rox/ui/button";
import { Checkbox } from "@rox/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";

export interface ComposeChatDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Open the freshly-created thread (key `chat:${threadId}`) on success. */
	onThreadCreated?: (threadId: string) => void;
}

/**
 * New-chat compose dialog for the inbox top bar's «Новая переписка» entry.
 *
 * Unlike {@link ComposeMailDialog} (which sends email by typed address), this
 * picks org members from `organization.members.list` and starts an in-app chat
 * thread via `comms.sendMessage` with `recipients:[{kind:'userId',userId}]` —
 * the same `assertOrgMembers`-guarded contract the server enforces. The
 * recipient-selection logic lives in `@rox/comms-core` (`buildChatDraft` etc.)
 * so web/mobile reuse it. On success it invalidates `comms.listThreads`
 * (cache-first) and opens the created thread.
 */
export function ComposeChatDialog({
	open,
	onOpenChange,
	onThreadCreated,
}: ComposeChatDialogProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [body, setBody] = useState("");

	const membersQuery = useQuery({
		...trpc.organization.members.list.queryOptions({ limit: 100 }),
		enabled: open,
	});

	const members: ComposeChatMember[] = membersQuery.data ?? [];
	const filtered = useMemo(
		() => filterMembers(members, search),
		[members, search],
	);

	const reset = () => {
		setSearch("");
		setSelected(new Set());
		setBody("");
	};

	const send = useMutation(
		trpc.comms.sendMessage.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.comms.listThreads.queryKey({ limit: 50 }),
				});
				onOpenChange(false);
				reset();
				toast.success("Переписка создана");
				if (result?.threadId) onThreadCreated?.(result.threadId);
			},
			onError: (error) => {
				logger.error("[InboxView] chat send failed", error);
				toast.error(error.message || "Не удалось начать переписку");
			},
		}),
	);

	const handleSend = () => {
		const draft = buildChatDraft(selected, body);
		if (!draft) return;
		send.mutate({ recipients: draft.recipients, body: draft.body });
	};

	const draft = buildChatDraft(selected, body);
	const canSend = draft !== null && !send.isPending;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent className="max-h-[min(720px,calc(100dvh-2rem))] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Новая переписка</DialogTitle>
					<DialogDescription>
						Выберите получателей из вашей организации.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label>Получатели</Label>
						<Command
							shouldFilter={false}
							className="rounded-md border bg-transparent"
						>
							<CommandInput
								placeholder="Поиск по имени или email…"
								value={search}
								onValueChange={setSearch}
							/>
							<CommandList className="max-h-48">
								{membersQuery.isLoading ? null : filtered.length === 0 ? (
									<CommandEmpty>Участники не найдены</CommandEmpty>
								) : (
									filtered.map((member) => {
										const checked = selected.has(member.id);
										return (
											<CommandItem
												key={member.id}
												value={member.id}
												onSelect={() =>
													setSelected((prev) =>
														toggleRecipient(prev, member.id),
													)
												}
												className="flex items-center gap-2"
											>
												<Checkbox
													checked={checked}
													className="pointer-events-none"
												/>
												<Avatar className="size-6">
													{member.image ? (
														<AvatarImage src={member.image} alt="" />
													) : null}
													<AvatarFallback className="text-[10px]">
														{memberLabel(member).slice(0, 2).toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<span className="truncate">{memberLabel(member)}</span>
											</CommandItem>
										);
									})
								)}
							</CommandList>
						</Command>
						<span
							className={cn(
								"text-muted-foreground text-xs",
								selected.size === 0 && "opacity-0",
							)}
						>
							Выбрано: {selected.size}
						</span>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="inbox-chat-body">Сообщение</Label>
						<Textarea
							id="inbox-chat-body"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							placeholder="Текст сообщения…"
							rows={6}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button disabled={!canSend} onClick={handleSend}>
						<Send className="size-4" /> Отправить
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
