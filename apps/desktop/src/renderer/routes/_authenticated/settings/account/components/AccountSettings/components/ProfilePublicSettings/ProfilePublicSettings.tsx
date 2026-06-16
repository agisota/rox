import type { RouterOutputs } from "@rox/trpc";
import { ActivityHeatmap } from "@rox/ui/atoms/ActivityHeatmap";
import {
	type ProfileStat,
	ProfileStatsGrid,
} from "@rox/ui/atoms/ProfileStatsGrid";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

type MyProfile = RouterOutputs["profile"]["getMine"];
type MyStats = RouterOutputs["profile"]["myStats"];

const HANDLE_PATTERN = /^[a-zA-Z0-9_-]+$/;
const numberFormatter = new Intl.NumberFormat("ru-RU");

function formatRox(value: string): string {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return value;
	return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
		parsed,
	);
}

function isValidHandle(handle: string): boolean {
	return (
		handle.length >= 2 && handle.length <= 40 && HANDLE_PATTERN.test(handle)
	);
}

export function ProfilePublicSettings() {
	const [profile, setProfile] = useState<MyProfile | null>(null);
	const [stats, setStats] = useState<MyStats | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [handleValue, setHandleValue] = useState("");
	const [isPublic, setIsPublic] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setIsLoading(true);
			try {
				const [profileResult, statsResult] = await Promise.all([
					apiTrpcClient.profile.getMine.query().catch(() => null),
					apiTrpcClient.profile.myStats.query().catch(() => null),
				]);
				if (cancelled) return;
				setProfile(profileResult);
				setStats(statsResult);
				setHandleValue(profileResult?.handle ?? "");
				setIsPublic(profileResult?.isPublic ?? false);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	// Preserve existing profile fields when saving — `profile.update` is an
	// upsert that overwrites every column, so we must echo current values back.
	async function persist(next: { handle: string; isPublic: boolean }) {
		if (!isValidHandle(next.handle)) {
			toast.error(
				"Никнейм: 2–40 символов, латиница, цифры, дефис и подчёркивание.",
			);
			return false;
		}

		setIsSaving(true);
		try {
			const saved = await apiTrpcClient.profile.update.mutate({
				handle: next.handle,
				isPublic: next.isPublic,
				displayName: profile?.displayName ?? null,
				bio: profile?.bio ?? null,
				avatarUrl: profile?.avatarUrl ?? null,
				location: profile?.location ?? null,
				websiteUrl: profile?.websiteUrl ?? null,
				contactEmail: profile?.contactEmail ?? null,
				telegram: profile?.telegram ?? null,
				max: profile?.max ?? null,
				wechat: profile?.wechat ?? null,
				twitter: profile?.twitter ?? null,
			});
			setProfile(saved);
			return true;
		} catch {
			toast.error("Не удалось сохранить профиль. Возможно, никнейм занят.");
			return false;
		} finally {
			setIsSaving(false);
		}
	}

	async function handleNicknameBlur() {
		const trimmed = handleValue.trim();
		if (trimmed === (profile?.handle ?? "")) return;
		if (!trimmed) {
			setHandleValue(profile?.handle ?? "");
			return;
		}
		const ok = await persist({ handle: trimmed, isPublic });
		if (ok) {
			toast.success("Никнейм обновлён");
		} else {
			setHandleValue(profile?.handle ?? "");
		}
	}

	async function handleToggle(next: boolean) {
		const trimmed = handleValue.trim() || profile?.handle || "";
		if (next && !isValidHandle(trimmed)) {
			toast.error("Сначала укажите никнейм, чтобы открыть публичный профиль.");
			return;
		}
		setIsPublic(next);
		const ok = await persist({ handle: trimmed, isPublic: next });
		if (ok) {
			toast.success(next ? "Профиль теперь публичный" : "Профиль скрыт");
		} else {
			setIsPublic(!next);
		}
	}

	const previewHandle = handleValue.trim() || "nickname";

	const statCards: ProfileStat[] = stats
		? [
				{
					key: "sessions",
					label: "Сессии",
					value: numberFormatter.format(stats.stats.sessions),
				},
				{
					key: "requests",
					label: "Запросы",
					value: numberFormatter.format(stats.stats.requests),
				},
				{
					key: "tokens",
					label: "Токены",
					value: numberFormatter.format(stats.stats.tokens),
				},
				{
					key: "rox",
					label: "Потрачено Rox",
					value: formatRox(stats.stats.roxSpent),
				},
				{
					key: "activeDays",
					label: "Активных дней",
					value: numberFormatter.format(stats.stats.activeDays),
				},
			]
		: [];

	if (isLoading) {
		return (
			<section className="space-y-3 rounded-lg border p-4">
				<Skeleton className="h-5 w-48" />
				<Skeleton className="h-10 w-80" />
				<div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
					<Skeleton className="h-16" />
					<Skeleton className="h-16" />
					<Skeleton className="h-16" />
					<Skeleton className="h-16" />
					<Skeleton className="h-16" />
				</div>
			</section>
		);
	}

	return (
		<section className="space-y-5 rounded-lg border p-4">
			<div>
				<h3 className="text-sm font-semibold">Публичный профиль</h3>
				<p className="text-xs text-muted-foreground">
					Никнейм и видимость вашей страницы Rox.
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="profile-nickname">Никнейм</Label>
				<Input
					id="profile-nickname"
					value={handleValue}
					onChange={(event) => setHandleValue(event.target.value)}
					onBlur={handleNicknameBlur}
					placeholder="nickname"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					className="w-80"
					disabled={isSaving}
				/>
				<p className="text-xs text-muted-foreground">
					Публичный профиль: rox.one/@{previewHandle}
				</p>
			</div>

			<div className="flex items-center justify-between gap-8">
				<div className="flex-1 min-w-0">
					<div className="text-sm font-medium">Публичный профиль</div>
					<div className="text-xs text-muted-foreground mt-0.5">
						Когда включено, профиль доступен всем по адресу rox.one/@
						{previewHandle}.
					</div>
				</div>
				<Switch
					checked={isPublic}
					onCheckedChange={handleToggle}
					disabled={isSaving}
					aria-label="Публичный профиль"
				/>
			</div>

			{statCards.length > 0 && (
				<div className="space-y-3">
					<div className="text-sm font-medium">Статистика</div>
					<ProfileStatsGrid stats={statCards} />
				</div>
			)}

			{stats && (
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<div className="text-sm font-medium">Активность за год</div>
						<div className="text-xs text-muted-foreground">
							{numberFormatter.format(stats.heatmap.total)} запросов
						</div>
					</div>
					<ActivityHeatmap days={stats.heatmap.days} />
				</div>
			)}
		</section>
	);
}
