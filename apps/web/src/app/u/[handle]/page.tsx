import { db } from "@rox/db/client";
import {
	getProfileAggregateStats,
	getProfileHeatmap,
} from "@rox/trpc/profile-stats";
import { ActivityHeatmap } from "@rox/ui/atoms/ActivityHeatmap";
import {
	type ProfileStat,
	ProfileStatsGrid,
} from "@rox/ui/atoms/ProfileStatsGrid";
import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Badge } from "@rox/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@rox/ui/card";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
	type ContactLink,
	ProfileContacts,
} from "./components/ProfileContacts";
import { ProfileShareButton } from "./components/ProfileShareButton";
import {
	type ProfileAchievement,
	type ProfileNote,
	ProfileTabs,
	type ToolBreakdown,
} from "./components/ProfileTabs";

type PublicProfilePageProps = {
	params: Promise<{ handle: string }>;
};

type PublicProfile = {
	userId: string;
	handle: string;
	displayName: string;
	bio: string | null;
	avatarUrl: string | null;
	location: string | null;
	websiteUrl: string | null;
	contactEmail: string | null;
	telegram: string | null;
	max: string | null;
	wechat: string | null;
	twitter: string | null;
};

export const dynamic = "force-dynamic";

const numberFormatter = new Intl.NumberFormat("ru");

function formatRox(value: string): string {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return value;
	return new Intl.NumberFormat("ru", { maximumFractionDigits: 2 }).format(
		parsed,
	);
}

async function getPublicProfile(handle: string): Promise<PublicProfile | null> {
	const profile = await db.query.userProfiles.findFirst({
		where: (userProfiles, { and, eq }) =>
			and(eq(userProfiles.handle, handle), eq(userProfiles.isPublic, true)),
		with: { user: true },
	});

	if (!profile) return null;

	return {
		userId: profile.userId,
		handle: profile.handle,
		displayName: profile.displayName ?? profile.user.name,
		bio: profile.bio,
		avatarUrl: profile.avatarUrl ?? profile.user.image,
		location: profile.location,
		websiteUrl: profile.websiteUrl,
		contactEmail: profile.contactEmail,
		telegram: profile.telegram,
		max: profile.max,
		wechat: profile.wechat,
		twitter: profile.twitter,
	};
}

async function getToolBreakdown(userId: string): Promise<ToolBreakdown[]> {
	const rows = await db.query.usageDaily.findMany({
		where: (usageDaily, { eq }) => eq(usageDaily.userId, userId),
		columns: { tool: true, totalTokens: true },
	});

	const tokensByTool = new Map<string, number>();
	for (const row of rows) {
		tokensByTool.set(
			row.tool,
			(tokensByTool.get(row.tool) ?? 0) + row.totalTokens,
		);
	}

	return [...tokensByTool.entries()]
		.map(([tool, totalTokens]) => ({ tool, totalTokens }))
		.sort((a, b) => b.totalTokens - a.totalTokens);
}

async function getPublishedNotes(userId: string): Promise<ProfileNote[]> {
	return db.query.profileNotes.findMany({
		where: (profileNotes, { and, eq }) =>
			and(eq(profileNotes.userId, userId), eq(profileNotes.isPublished, true)),
		orderBy: (profileNotes, { desc }) => [desc(profileNotes.createdAt)],
		columns: {
			id: true,
			body: true,
			createdAt: true,
		},
	});
}

async function getAchievements(userId: string): Promise<ProfileAchievement[]> {
	const rows = await db.query.userAchievements.findMany({
		where: (userAchievements, { eq }) => eq(userAchievements.userId, userId),
		orderBy: (userAchievements, { desc }) => [desc(userAchievements.awardedAt)],
		with: { achievement: true },
	});

	return rows.map((row) => ({
		id: row.achievement.id,
		title: row.achievement.title,
		description: row.achievement.description,
		icon: row.achievement.icon,
		tier: row.achievement.tier,
		awardedAt: row.awardedAt,
	}));
}

function getInitials(displayName: string) {
	return displayName
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
}

function getLeague(tokens: number) {
	if (tokens >= 1_000_000_000) return "Лига 1B+";
	if (tokens >= 100_000_000) return "Лига 100M+";
	if (tokens >= 10_000_000) return "Лига 10M+";
	if (tokens >= 1_000_000) return "Лига 1M+";
	if (tokens >= 100_000) return "Лига 100K+";
	return "Лига старта";
}

function normalizeSocialHandle(value: string) {
	return value.trim().replace(/^@/, "");
}

function externalHref(value: string, fallback: (value: string) => string) {
	const trimmed = value.trim();
	if (/^https?:\/\//.test(trimmed)) {
		return trimmed;
	}
	return fallback(trimmed);
}

function buildContacts(profile: PublicProfile): ContactLink[] {
	const contacts: ContactLink[] = [];

	if (profile.contactEmail) {
		contacts.push({
			label: "Эл. почта",
			href: `mailto:${profile.contactEmail}`,
			icon: "email",
		});
	}
	if (profile.telegram) {
		contacts.push({
			label: "Telegram",
			href: externalHref(
				profile.telegram,
				(value) => `https://t.me/${normalizeSocialHandle(value)}`,
			),
			icon: "telegram",
		});
	}
	if (profile.max) {
		contacts.push({
			label: "Max",
			href: externalHref(
				profile.max,
				(value) => `https://max.ru/${normalizeSocialHandle(value)}`,
			),
			icon: "message",
		});
	}
	if (profile.wechat) {
		contacts.push({
			label: "WeChat",
			href: externalHref(
				profile.wechat,
				(value) => `weixin://dl/chat/${encodeURIComponent(value)}`,
			),
			icon: "message",
		});
	}
	if (profile.twitter) {
		contacts.push({
			label: "Twitter",
			href: externalHref(
				profile.twitter,
				(value) => `https://x.com/${normalizeSocialHandle(value)}`,
			),
			icon: "social",
		});
	}

	return contacts;
}

async function getProfileUrl(handle: string) {
	const headerList = await headers();
	const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
	const protocol = headerList.get("x-forwarded-proto") ?? "https";

	if (!host) {
		return `/u/${handle}`;
	}

	return `${protocol}://${host}/u/${handle}`;
}

export async function generateMetadata({
	params,
}: PublicProfilePageProps): Promise<Metadata> {
	const { handle } = await params;
	const profile = await getPublicProfile(handle);

	if (!profile) {
		return {
			title: "Профиль не найден · Rox",
		};
	}

	return {
		title: `${profile.displayName} (@${profile.handle}) · Rox`,
		description:
			profile.bio ?? "Публичный профиль Rox: сессии, токены и активность.",
	};
}

export default async function PublicProfilePage({
	params,
}: PublicProfilePageProps) {
	const { handle } = await params;
	const profile = await getPublicProfile(handle);

	if (!profile) {
		notFound();
	}

	const [
		stats,
		heatmap,
		toolBreakdown,
		notes,
		profileAchievements,
		profileUrl,
	] = await Promise.all([
		getProfileAggregateStats(profile.userId),
		getProfileHeatmap(profile.userId),
		getToolBreakdown(profile.userId),
		getPublishedNotes(profile.userId),
		getAchievements(profile.userId),
		getProfileUrl(profile.handle),
	]);

	const contacts = buildContacts(profile);

	const statCards: ProfileStat[] = [
		{
			key: "sessions",
			label: "Сессии",
			value: numberFormatter.format(stats.sessions),
		},
		{
			key: "requests",
			label: "Запросы",
			value: numberFormatter.format(stats.requests),
		},
		{
			key: "tokens",
			label: "Токены",
			value: numberFormatter.format(stats.tokens),
		},
		{
			key: "rox",
			label: "Потрачено Rox",
			value: formatRox(stats.roxSpent),
		},
		{
			key: "activeDays",
			label: "Активных дней",
			value: numberFormatter.format(stats.activeDays),
		},
	];

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				<section className="rounded-xl border bg-card p-5 sm:p-6">
					<div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
						<div className="flex min-w-0 gap-4">
							<Avatar className="size-20 border">
								{profile.avatarUrl && (
									<AvatarImage
										src={profile.avatarUrl}
										alt={`Аватар ${profile.displayName}`}
									/>
								)}
								<AvatarFallback className="text-lg">
									{getInitials(profile.displayName) || "R"}
								</AvatarFallback>
							</Avatar>
							<div className="min-w-0 space-y-3">
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<h1 className="text-2xl font-medium tracking-tight">
											{profile.displayName}
										</h1>
										<Badge variant="secondary">{getLeague(stats.tokens)}</Badge>
									</div>
									<p className="mt-1 text-sm text-muted-foreground">
										@{profile.handle}
									</p>
									{profile.location && (
										<p className="mt-1 text-sm text-muted-foreground">
											{profile.location}
										</p>
									)}
									{profile.websiteUrl && (
										<a
											href={profile.websiteUrl}
											target="_blank"
											rel="noreferrer noopener"
											className="mt-1 inline-block text-sm text-primary underline-offset-4 hover:underline"
										>
											{profile.websiteUrl.replace(/^https?:\/\//, "")}
										</a>
									)}
								</div>
								{profile.bio && (
									<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
										{profile.bio}
									</p>
								)}
								<ProfileContacts contacts={contacts} />
							</div>
						</div>
						<ProfileShareButton url={profileUrl} />
					</div>
				</section>

				<section aria-label="Статистика">
					<ProfileStatsGrid stats={statCards} />
				</section>

				<Card>
					<CardHeader>
						<CardTitle>Активность за год</CardTitle>
					</CardHeader>
					<CardContent>
						<ActivityHeatmap
							days={heatmap.days}
							ariaLabel={`Активность: ${numberFormatter.format(heatmap.total)} запросов за год`}
						/>
						<p className="mt-3 text-xs text-muted-foreground">
							{numberFormatter.format(heatmap.total)} запросов за последний год
						</p>
					</CardContent>
				</Card>

				<ProfileTabs
					tools={toolBreakdown}
					notes={notes}
					achievements={profileAchievements}
				/>
			</div>
		</main>
	);
}
