import { Avatar } from "@rox/ui/atoms/Avatar";
import { Badge } from "@rox/ui/badge";
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
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@rox/ui/table";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { AddMemberButton } from "./components/AddMemberButton";

interface TeamDetailSettingsProps {
	teamId: string;
}

interface TeamMemberRow {
	teamMembershipId: string;
	userId: string;
	name: string | null;
	email: string;
	image: string | null;
	createdAt: Date;
}

type OpenDialog = "delete" | "leaveTeam" | null;

export function TeamDetailSettings({ teamId }: TeamDetailSettingsProps) {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const collections = useCollections();
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const currentUserId = session?.user?.id;

	const { data: teamsData, isReady: teamsReady } = useLiveQuery(
		(q) =>
			q
				.from({ teams: collections.teams })
				.select(({ teams }) => ({ ...teams })),
		[collections],
	);

	const { data: orgUsers } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.innerJoin({ users: collections.users }, ({ members, users }) =>
					eq(members.userId, users.id),
				)
				.select(({ users }) => ({ ...users })),
		[collections],
	);

	const { data: membersRaw, isReady: membersReady } = useLiveQuery(
		(q) =>
			q
				.from({ tm: collections.teamMembers })
				.innerJoin({ users: collections.users }, ({ tm, users }) =>
					eq(tm.userId, users.id),
				)
				.select(({ tm, users }) => ({
					teamMembershipId: tm.id,
					teamId: tm.teamId,
					userId: tm.userId,
					name: users.name,
					email: users.email,
					image: users.image,
					createdAt: tm.createdAt,
				})),
		[collections],
	);

	const team = (teamsData ?? []).find((t) => t.id === teamId) ?? null;
	const members: TeamMemberRow[] = (membersRaw ?? [])
		.filter((r) => r.teamId === teamId)
		.map((r) => ({
			teamMembershipId: r.teamMembershipId,
			userId: r.userId,
			name: r.name ?? null,
			email: r.email,
			image: r.image ?? null,
			createdAt: r.createdAt ? new Date(r.createdAt) : new Date(0),
		}))
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

	const currentMember = members.find((m) => m.userId === currentUserId);

	const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
	const [nameValue, setNameValue] = useState("");
	const [slugValue, setSlugValue] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Populate form once the team row arrives from Electric (and re-populate
	// on navigation to a different team). Keyed off team?.id — which is
	// undefined until the collection hydrates, then becomes teamId — so we
	// don't seed empty strings before the row is loaded, and subsequent
	// Electric updates to the same row don't clobber in-progress edits.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only resync when the loaded team's id changes
	useEffect(() => {
		if (!team) return;
		setNameValue(team.name);
		setSlugValue(team.slug);
	}, [team?.id]);

	const formatDate = (date: Date) =>
		date.toLocaleDateString("ru-RU", { month: "short", day: "numeric" });

	const trimmedName = nameValue.trim();
	const trimmedSlug = slugValue.trim();
	const isDirty =
		!!team &&
		(trimmedName !== team.name || trimmedSlug !== team.slug) &&
		trimmedName.length > 0 &&
		trimmedSlug.length > 0;

	async function handleGeneralSave() {
		if (!team || !isDirty) return;
		setIsSubmitting(true);
		try {
			const result = await authClient.organization.updateTeam({
				teamId,
				data: { name: trimmedName, slug: trimmedSlug },
			});
			if (result.error) {
				toast.error(result.error.message ?? "Не удалось сохранить команду");
				return;
			}
			toast.success("Сохранено");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось сохранить команду",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleDelete() {
		if (!activeOrganizationId) return;
		setIsSubmitting(true);
		try {
			const result = await authClient.organization.removeTeam({
				teamId,
				organizationId: activeOrganizationId,
			});
			if (result.error) {
				toast.error(result.error.message ?? "Не удалось удалить команду");
				return;
			}
			toast.success(`Удалена команда "${team?.name ?? "команда"}"`);
			navigate({ to: "/settings/teams" });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось удалить команду",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleLeaveTeam() {
		if (!currentUserId) return;
		setIsSubmitting(true);
		try {
			await apiTrpcClient.team.removeMember.mutate({
				teamId,
				userId: currentUserId,
			});
			toast.success("Вы вышли из команды");
			setOpenDialog(null);
			navigate({ to: "/settings/teams" });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось выйти из команды",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!activeOrganizationId) return null;

	const isReady = teamsReady && membersReady;

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="px-8 pt-8 pb-4">
				<div className="max-w-5xl">
					<Link
						to="/settings/teams"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
					>
						<HiArrowLeft className="h-4 w-4" />
						Все команды
					</Link>
					<h2 className="text-2xl font-semibold">Настройки команды</h2>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="px-8 pb-16 space-y-12">
					{team && (
						<div className="max-w-5xl">
							<div className="space-y-4 max-w-md">
								<div className="space-y-1.5">
									<Label htmlFor="team-name-edit">Название</Label>
									<Input
										id="team-name-edit"
										value={nameValue}
										onChange={(event) => setNameValue(event.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="team-slug-edit">Слаг</Label>
									<Input
										id="team-slug-edit"
										value={slugValue}
										onChange={(event) => setSlugValue(event.target.value)}
									/>
									<p className="text-xs text-muted-foreground">
										Идентификатор для URL, уникальный внутри вашей организации.
									</p>
								</div>
								<div>
									<Button
										onClick={handleGeneralSave}
										disabled={!isDirty || isSubmitting}
									>
										{isSubmitting ? "Сохранение..." : "Сохранить"}
									</Button>
								</div>
							</div>
						</div>
					)}

					<div className="max-w-5xl space-y-4">
						<div className="flex items-center justify-between gap-4">
							<h3 className="text-lg font-semibold">Участники команды</h3>
							{team && (
								<AddMemberButton
									teamId={teamId}
									currentUserId={currentUserId}
									currentMemberUserIds={new Set(members.map((m) => m.userId))}
									orgUsers={orgUsers ?? []}
								/>
							)}
						</div>

						{!isReady && members.length === 0 ? (
							<div className="space-y-2 border rounded-lg">
								{[1, 2, 3].map((i) => (
									<div key={i} className="flex items-center gap-4 p-4">
										<Skeleton className="h-8 w-8 rounded-full" />
										<div className="flex-1 space-y-2">
											<Skeleton className="h-4 w-48" />
											<Skeleton className="h-3 w-32" />
										</div>
										<Skeleton className="h-4 w-16" />
									</div>
								))}
							</div>
						) : members.length === 0 ? (
							<div className="text-center py-12 text-muted-foreground border rounded-lg">
								Участников пока нет
							</div>
						) : (
							<div className="border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Имя</TableHead>
											<TableHead>Эл. почта</TableHead>
											<TableHead>Дата вступления</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{members.map((member) => {
											const isCurrentUser = member.userId === currentUserId;
											return (
												<TableRow key={member.teamMembershipId}>
													<TableCell>
														<div className="flex items-center gap-3">
															<Avatar
																size="md"
																fullName={member.name ?? ""}
																image={member.image}
															/>
															<div className="flex items-center gap-2">
																<span className="font-medium">
																	{member.name || "Неизвестно"}
																</span>
																{isCurrentUser && (
																	<Badge
																		variant="secondary"
																		className="text-xs"
																	>
																		Вы
																	</Badge>
																)}
															</div>
														</div>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{member.email}
													</TableCell>
													<TableCell className="text-muted-foreground">
														{formatDate(member.createdAt)}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						)}
					</div>

					{team && (
						<div className="max-w-5xl space-y-4">
							<h3 className="text-lg font-semibold">Опасная зона</h3>
							<div className="border rounded-lg divide-y">
								{currentMember && (
									<div className="flex items-center justify-between gap-4 p-4">
										<div className="min-w-0">
											<p className="text-sm font-medium">Выйти из команды</p>
											<p className="text-xs text-muted-foreground mt-0.5">
												Вы перестанете быть участником этой команды. Другой
												участник сможет добавить вас снова.
											</p>
										</div>
										<Button
											variant="outline"
											onClick={() => setOpenDialog("leaveTeam")}
										>
											Выйти из команды
										</Button>
									</div>
								)}
								<div className="flex items-center justify-between gap-4 p-4">
									<div className="min-w-0">
										<p className="text-sm font-medium">Удалить команду</p>
										<p className="text-xs text-muted-foreground mt-0.5">
											Навсегда удалить <strong>{team.name}</strong> и всех ее
											участников. Это действие нельзя отменить.
										</p>
									</div>
									<Button
										variant="destructive"
										onClick={() => setOpenDialog("delete")}
									>
										Удалить команду
									</Button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			<Dialog
				open={openDialog === "delete"}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Удалить команду</DialogTitle>
						<DialogDescription>
							Команда <strong>{team?.name}</strong> будет удалена вместе со
							всеми участниками. Это действие нельзя отменить.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpenDialog(null)}
							disabled={isSubmitting}
						>
							Отмена
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Удаление..." : "Удалить команду"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={openDialog === "leaveTeam"}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Выйти из команды</DialogTitle>
						<DialogDescription>
							Вы перестанете быть участником этой команды. Другой участник
							сможет добавить вас снова.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpenDialog(null)}
							disabled={isSubmitting}
						>
							Отмена
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleLeaveTeam}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Выход..." : "Выйти из команды"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
