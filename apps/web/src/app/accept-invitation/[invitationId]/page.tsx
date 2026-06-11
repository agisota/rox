import { Button } from "@rox/ui/button";
import { TRPCClientError } from "@trpc/client";
import { Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { api } from "../../../trpc/server";
import { AcceptInvitationButton } from "./AcceptInvitationButton";

interface PageProps {
	params: Promise<{ invitationId: string }>;
	searchParams: Promise<{ token?: string }>;
}

function isInvitationNotFoundError(error: unknown) {
	return (
		error instanceof TRPCClientError &&
		(error.data?.code === "NOT_FOUND" ||
			error.shape?.data?.code === "NOT_FOUND")
	);
}

function getRoleLabel(role: string | null) {
	if (!role) return "участника";

	switch (role) {
		case "owner":
			return "владельца";
		case "admin":
			return "администратора";
		case "member":
			return "участника";
		default:
			return role;
	}
}

export default async function AcceptInvitationPage({
	params,
	searchParams,
}: PageProps) {
	const { invitationId } = await params;
	const { token } = await searchParams;
	const trpc = await api();

	let invitation: Awaited<
		ReturnType<typeof trpc.organization.getInvitationPreview.query>
	> | null;

	if (!token) {
		invitation = null;
	} else {
		try {
			invitation = await trpc.organization.getInvitationPreview.query({
				invitationId,
				token,
			});
		} catch (error) {
			if (isInvitationNotFoundError(error)) {
				invitation = null;
			} else {
				console.error(
					"[accept-invitation] Failed to load invitation preview",
					error,
				);
				throw error;
			}
		}
	}

	if (
		!invitation ||
		invitation.isExpired ||
		invitation.status !== "pending" ||
		!token
	) {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<div className="max-w-lg space-y-6 text-center">
					<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-border">
						<Users className="h-8 w-8 text-muted-foreground" />
					</div>
					<div className="space-y-4">
						<h1 className="text-2xl font-semibold">
							Ссылка приглашения не существует
						</h1>
						<p className="text-muted-foreground">
							Срок действия приглашения в команду истек или оно не существует.
							Запросите новую ссылку у владельца команды или проверьте URL,
							чтобы убедиться, что он введен правильно.
						</p>
					</div>
					<Button asChild variant="outline">
						<Link href="/">Вернуться на панель управления</Link>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<div className="max-w-lg space-y-6 text-center">
				{invitation.organization.logo && (
					<div className="relative mx-auto h-16 w-16">
						<Image
							src={invitation.organization.logo}
							alt={invitation.organization.name}
							fill
							className="rounded-lg object-contain"
						/>
					</div>
				)}

				<div className="space-y-4">
					<h1 className="text-2xl font-semibold">
						Вас пригласили присоединиться к {invitation.organization.name}
					</h1>
					<p className="text-muted-foreground">
						{invitation.inviter.name} приглашает вас присоединиться с ролью{" "}
						{getRoleLabel(invitation.role)}.
					</p>
				</div>

				<AcceptInvitationButton invitationId={invitationId} token={token} />
			</div>
		</div>
	);
}
