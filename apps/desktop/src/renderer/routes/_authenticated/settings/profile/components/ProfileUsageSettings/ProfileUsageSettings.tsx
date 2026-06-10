import type { RouterInputs, RouterOutputs } from "@rox/trpc";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { Textarea } from "@rox/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

type ProfileUsageData = RouterOutputs["user"]["profileUsage"];
type ProfileFormInput = RouterInputs["user"]["updateUsageProfile"];

const PROFILE_USAGE_QUERY_KEY = ["settings", "profile-usage"] as const;
const PROFILE_SKELETON_KEYS = ["total", "input", "output", "tier"] as const;

const emptyProfileForm: ProfileFormInput = {
	handle: "",
	displayName: null,
	bio: null,
	contactEmail: null,
	telegram: null,
	max: null,
	wechat: null,
	twitter: null,
	isPublic: false,
};

interface ProfileUsageSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ProfileUsageSettings({
	visibleItems,
}: ProfileUsageSettingsProps) {
	const showUsage = isItemVisible(SETTING_ITEM_ID.PROFILE_USAGE, visibleItems);
	const showProfile = isItemVisible(SETTING_ITEM_ID.PROFILE_FORM, visibleItems);

	const queryClient = useQueryClient();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const [form, setForm] = useState<ProfileFormInput>(emptyProfileForm);

	const profileUsageQuery = useQuery({
		queryKey: PROFILE_USAGE_QUERY_KEY,
		queryFn: () => apiTrpcClient.user.profileUsage.query(),
	});

	const updateProfileMutation = useMutation({
		mutationFn: (input: ProfileFormInput) =>
			apiTrpcClient.user.updateUsageProfile.mutate(input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: PROFILE_USAGE_QUERY_KEY,
			});
			toast.success("Профиль сохранён");
		},
		onError: (error: Error) => {
			toast.error(error.message || "Не удалось сохранить профиль");
		},
	});

	useEffect(() => {
		const profile = profileUsageQuery.data?.profile;
		if (!profile) return;

		setForm({
			handle: profile.handle,
			displayName: profile.displayName,
			bio: profile.bio,
			contactEmail: profile.contactEmail,
			telegram: profile.telegram,
			max: profile.max,
			wechat: profile.wechat,
			twitter: profile.twitter,
			isPublic: profile.isPublic,
		});
	}, [profileUsageQuery.data?.profile]);

	const shareUrl = useMemo(() => {
		const handle = form.handle.trim();
		if (!handle) return null;
		return `https://rox.one/u/${encodeURIComponent(handle)}`;
	}, [form.handle]);

	function updateField<K extends keyof ProfileFormInput>(
		key: K,
		value: ProfileFormInput[K],
	) {
		setForm((current) => ({ ...current, [key]: value }));
	}

	function normalizeNullable(value: string): string | null {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		updateProfileMutation.mutate({
			...form,
			handle: form.handle.trim().toLowerCase(),
			displayName: normalizeNullable(form.displayName ?? ""),
			bio: normalizeNullable(form.bio ?? ""),
			contactEmail: normalizeNullable(form.contactEmail ?? ""),
			telegram: normalizeNullable(form.telegram ?? ""),
			max: normalizeNullable(form.max ?? ""),
			wechat: normalizeNullable(form.wechat ?? ""),
			twitter: normalizeNullable(form.twitter ?? ""),
		});
	}

	function handleShare() {
		if (!shareUrl) {
			toast.error("Сначала укажите handle");
			return;
		}
		openUrl.mutate(shareUrl);
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Профиль и usage</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Публичный профиль Rox, лига и расход токенов по инструментам.
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					onClick={handleShare}
					disabled={!shareUrl || openUrl.isPending}
					className="gap-2"
				>
					<HiArrowTopRightOnSquare className="h-4 w-4" />
					Поделиться профилем
				</Button>
			</div>

			{profileUsageQuery.isLoading ? (
				<ProfileUsageSkeleton />
			) : profileUsageQuery.isError ? (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
					Не удалось загрузить профиль и usage.
				</div>
			) : (
				<div className="space-y-6">
					{showUsage && profileUsageQuery.data && (
						<UsageOverview data={profileUsageQuery.data} />
					)}
					{showProfile && (
						<ProfileForm
							form={form}
							isPending={updateProfileMutation.isPending}
							shareUrl={shareUrl}
							onSubmit={handleSubmit}
							onFieldChange={updateField}
						/>
					)}
				</div>
			)}
		</div>
	);
}

function UsageOverview({ data }: { data: ProfileUsageData }) {
	const maxDailyTokens = Math.max(
		1,
		...data.dailyUsage.map((item) => item.totalTokens),
	);
	const maxToolTokens = Math.max(
		1,
		...data.toolUsage.map((item) => item.totalTokens),
	);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-4">
				<StatCard
					label="Всего токенов"
					value={formatTokens(data.totals.totalTokens)}
				/>
				<StatCard
					label="Входные"
					value={formatTokens(data.totals.inputTokens)}
				/>
				<StatCard
					label="Выходные"
					value={formatTokens(data.totals.outputTokens)}
				/>
				<Card className="rounded-lg py-4">
					<CardContent className="px-4">
						<div className="text-xs text-muted-foreground">Лига</div>
						<div className="mt-2 flex items-center gap-2">
							<Badge variant="secondary">{data.leagueTier.title}</Badge>
						</div>
						<div className="mt-2 text-xs text-muted-foreground">
							{data.leagueTier.description}
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
				<Card className="rounded-lg">
					<CardHeader>
						<CardTitle>Дневная динамика</CardTitle>
						<CardDescription>
							Последние 30 дней с записанным usage
						</CardDescription>
					</CardHeader>
					<CardContent>
						{data.dailyUsage.length > 0 ? (
							<div
								className="flex h-44 items-end gap-1"
								role="img"
								aria-label="График дневного usage"
							>
								{data.dailyUsage.map((item) => (
									<div
										key={item.date}
										className="flex min-w-0 flex-1 flex-col items-center gap-2"
										title={`${item.date}: ${formatTokens(item.totalTokens)}`}
									>
										<div
											className="w-full rounded-t bg-primary/80"
											style={{
												height: `${Math.max(8, (item.totalTokens / maxDailyTokens) * 144)}px`,
											}}
										/>
										<span className="w-full truncate text-center text-[10px] text-muted-foreground">
											{formatShortDate(item.date)}
										</span>
									</div>
								))}
							</div>
						) : (
							<EmptyState text="Пока нет дневной статистики." />
						)}
					</CardContent>
				</Card>

				<Card className="rounded-lg">
					<CardHeader>
						<CardTitle>По инструментам</CardTitle>
						<CardDescription>Суммарный расход токенов</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{data.toolUsage.length > 0 ? (
							data.toolUsage.map((item) => (
								<div key={item.tool} className="space-y-1.5">
									<div className="flex items-center justify-between gap-3 text-sm">
										<span className="truncate font-medium">{item.tool}</span>
										<span className="text-muted-foreground">
											{formatTokens(item.totalTokens)}
										</span>
									</div>
									<div className="h-2 rounded-full bg-muted">
										<div
											className="h-2 rounded-full bg-primary"
											style={{
												width: `${Math.max(4, (item.totalTokens / maxToolTokens) * 100)}%`,
											}}
										/>
									</div>
								</div>
							))
						) : (
							<EmptyState text="Инструменты ещё не отправляли usage." />
						)}
					</CardContent>
				</Card>
			</div>

			{data.achievements.length > 0 && (
				<Card className="rounded-lg">
					<CardHeader>
						<CardTitle>Достижения</CardTitle>
						<CardDescription>Знаки, открытые в профиле Rox</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-wrap gap-2">
						{data.achievements.map((achievement) => (
							<Badge key={achievement.id} variant="outline" className="gap-1">
								{achievement.icon && <span>{achievement.icon}</span>}
								{achievement.title}
							</Badge>
						))}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

interface ProfileFormProps {
	form: ProfileFormInput;
	isPending: boolean;
	shareUrl: string | null;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onFieldChange: <K extends keyof ProfileFormInput>(
		key: K,
		value: ProfileFormInput[K],
	) => void;
}

function ProfileForm({
	form,
	isPending,
	shareUrl,
	onSubmit,
	onFieldChange,
}: ProfileFormProps) {
	return (
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle>Публичный профиль</CardTitle>
				<CardDescription>
					Эти данные показываются на странице профиля, если включена публикация.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-5" onSubmit={onSubmit}>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<Field label="Handle" htmlFor="profile-handle">
							<Input
								id="profile-handle"
								value={form.handle}
								onChange={(event) =>
									onFieldChange("handle", event.target.value.toLowerCase())
								}
								placeholder="ivan_rocks"
								pattern="[a-z0-9_]{3,32}"
								required
							/>
						</Field>
						<Field label="Отображаемое имя" htmlFor="profile-display-name">
							<Input
								id="profile-display-name"
								value={form.displayName ?? ""}
								onChange={(event) =>
									onFieldChange("displayName", event.target.value)
								}
								placeholder="Иван"
							/>
						</Field>
					</div>

					<Field label="О себе" htmlFor="profile-bio">
						<Textarea
							id="profile-bio"
							value={form.bio ?? ""}
							onChange={(event) => onFieldChange("bio", event.target.value)}
							placeholder="Коротко: чем занимаетесь, какие агенты и проекты используете."
							maxLength={240}
						/>
					</Field>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<Field label="Email для связи" htmlFor="profile-contact-email">
							<Input
								id="profile-contact-email"
								type="email"
								value={form.contactEmail ?? ""}
								onChange={(event) =>
									onFieldChange("contactEmail", event.target.value)
								}
								placeholder="you@example.com"
							/>
						</Field>
						<Field label="Telegram" htmlFor="profile-telegram">
							<Input
								id="profile-telegram"
								value={form.telegram ?? ""}
								onChange={(event) =>
									onFieldChange("telegram", event.target.value)
								}
								placeholder="@username"
							/>
						</Field>
						<Field label="Max" htmlFor="profile-max">
							<Input
								id="profile-max"
								value={form.max ?? ""}
								onChange={(event) => onFieldChange("max", event.target.value)}
								placeholder="@username"
							/>
						</Field>
						<Field label="WeChat" htmlFor="profile-wechat">
							<Input
								id="profile-wechat"
								value={form.wechat ?? ""}
								onChange={(event) =>
									onFieldChange("wechat", event.target.value)
								}
								placeholder="wechat_id"
							/>
						</Field>
						<Field label="Twitter / X" htmlFor="profile-twitter">
							<Input
								id="profile-twitter"
								value={form.twitter ?? ""}
								onChange={(event) =>
									onFieldChange("twitter", event.target.value)
								}
								placeholder="@username"
							/>
						</Field>
					</div>

					<div className="flex items-center justify-between gap-6 rounded-md border p-4">
						<div className="space-y-1">
							<Label htmlFor="profile-public">Публичный профиль</Label>
							<p className="text-xs text-muted-foreground">
								{shareUrl ?? "Ссылка появится после ввода handle."}
							</p>
						</div>
						<Switch
							id="profile-public"
							checked={form.isPublic}
							onCheckedChange={(checked) => onFieldChange("isPublic", checked)}
						/>
					</div>

					<div className="flex justify-end">
						<Button type="submit" disabled={isPending}>
							{isPending ? "Сохранение..." : "Сохранить профиль"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

function Field({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
		</div>
	);
}

function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<Card className="rounded-lg py-4">
			<CardContent className="px-4">
				<div className="text-xs text-muted-foreground">{label}</div>
				<div className="mt-2 text-2xl font-semibold">{value}</div>
			</CardContent>
		</Card>
	);
}

function EmptyState({ text }: { text: string }) {
	return (
		<div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
			{text}
		</div>
	);
}

function ProfileUsageSkeleton() {
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-4">
				{PROFILE_SKELETON_KEYS.map((key) => (
					<Skeleton key={key} className="h-24 rounded-lg" />
				))}
			</div>
			<Skeleton className="h-72 rounded-lg" />
			<Skeleton className="h-96 rounded-lg" />
		</div>
	);
}

function formatTokens(value: number) {
	return new Intl.NumberFormat("ru-RU", {
		notation: value >= 100_000 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(value);
}

function formatShortDate(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value.slice(5);
	return new Intl.DateTimeFormat("ru-RU", {
		day: "2-digit",
		month: "2-digit",
	}).format(date);
}
