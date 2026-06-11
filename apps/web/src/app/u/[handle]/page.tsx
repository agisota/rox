import { db } from "@rox/db/client";
import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Badge } from "@rox/ui/badge";
import { Card, CardContent } from "@rox/ui/card";
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
import { UsageBars } from "./components/UsageBars";

type PublicProfilePageProps = {
	params: Promise<{ handle: string }>;
};

type PublicProfile = {
	userId: string;
	handle: string;
	displayName: string;
	bio: string | null;
	avatarUrl: string | null;
	contactEmail: string | null;
	telegram: string | null;
	max: string | null;
	wechat: string | null;
	twitter: string | null;
};

type UsageDay = {
	date: string;
	totalTokens: number;
};

export const dynamic = "force-dynamic";

const numberFormatter = new Intl.NumberFormat("ru");

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
		contactEmail: profile.contactEmail,
		telegram: profile.telegram,
		max: profile.max,
		wechat: profile.wechat,
		twitter: profile.twitter,
	};
}

async function getUsageRows() {
	return db.query.usageDaily.findMany({
		columns: {
			userId: true,
			date: true,
			tool: true,
			totalTokens: true,
		},
	});
}

function getTotalTokens(
	rows: Awaited<ReturnType<typeof getUsageRows>>,
	userId: string,
): number {
	return rows
		.filter((row) => row.userId === userId)
		.reduce((total, row) => total + row.totalTokens, 0);
}

function getRank(
	rows: Awaited<ReturnType<typeof getUsageRows>>,
	userId: string,
): number | null {
	const tokensByUserId = new Map<string, number>();

	for (const row of rows) {
		tokensByUserId.set(
			row.userId,
			(tokensByUserId.get(row.userId) ?? 0) + row.totalTokens,
		);
	}

	const rankedRows = [...tokensByUserId.entries()].sort((a, b) => b[1] - a[1]);
	const index = rankedRows.findIndex(
		([rankedUserId]) => rankedUserId === userId,
	);
	return index >= 0 ? index + 1 : null;
}

function getStreakDays(
	rows: Awaited<ReturnType<typeof getUsageRows>>,
	userId: string,
): number {
	const activeDates = new Set(
		rows.filter((row) => row.userId === userId).map((row) => row.date),
	);
	let streak = 0;
	const cursor = new Date();

	while (true) {
		const dateKey = cursor.toISOString().slice(0, 10);
		if (!activeDates.has(dateKey)) {
			break;
		}
		streak += 1;
		cursor.setDate(cursor.getDate() - 1);
	}

	return streak;
}

function getDailyUsage(
	rows: Awaited<ReturnType<typeof getUsageRows>>,
	userId: string,
): UsageDay[] {
	const today = new Date();
	const start = new Date(today);
	start.setDate(today.getDate() - 13);

	const tokensByDate = new Map<string, number>();
	for (const row of rows) {
		if (row.userId !== userId) continue;
		tokensByDate.set(
			row.date,
			(tokensByDate.get(row.date) ?? 0) + row.totalTokens,
		);
	}

	return Array.from({ length: 14 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const dateKey = date.toISOString().slice(0, 10);

		return {
			date: dateKey,
			totalTokens: tokensByDate.get(dateKey) ?? 0,
		};
	});
}

function getToolBreakdown(
	rows: Awaited<ReturnType<typeof getUsageRows>>,
	userId: string,
): ToolBreakdown[] {
	const tokensByTool = new Map<string, number>();

	for (const row of rows) {
		if (row.userId !== userId) continue;
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

function getLeague(totalTokens: number) {
	if (totalTokens >= 1_000_000_000) return "Лига 1B+";
	if (totalTokens >= 100_000_000) return "Лига 100M+";
	if (totalTokens >= 10_000_000) return "Лига 10M+";
	if (totalTokens >= 1_000_000) return "Лига 1M+";
	if (totalTokens >= 100_000) return "Лига 100K+";
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
			profile.bio ?? "Публичный профиль Rox: токены, заметки и достижения.",
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

	const [usageRows, notes, profileAchievements, profileUrl] = await Promise.all(
		[
			getUsageRows(),
			getPublishedNotes(profile.userId),
			getAchievements(profile.userId),
			getProfileUrl(profile.handle),
		],
	);

	const totalTokens = getTotalTokens(usageRows, profile.userId);
	const rank = getRank(usageRows, profile.userId);
	const streakDays = getStreakDays(usageRows, profile.userId);
	const dailyUsage = getDailyUsage(usageRows, profile.userId);
	const toolBreakdown = getToolBreakdown(usageRows, profile.userId);

	const contacts = buildContacts(profile);

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
										<Badge variant="secondary">{getLeague(totalTokens)}</Badge>
									</div>
									<p className="mt-1 text-sm text-muted-foreground">
										@{profile.handle}
									</p>
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

				<section className="grid gap-3 sm:grid-cols-3" aria-label="Статистика">
					<Card>
						<CardContent className="pt-6">
							<p className="text-sm text-muted-foreground">Всего токенов</p>
							<p className="mt-2 text-2xl font-medium">
								{numberFormatter.format(totalTokens)}
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="pt-6">
							<p className="text-sm text-muted-foreground">Место</p>
							<p className="mt-2 text-2xl font-medium">
								{rank ? `#${numberFormatter.format(rank)}` : "Нет данных"}
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="pt-6">
							<p className="text-sm text-muted-foreground">Дней подряд</p>
							<p className="mt-2 text-2xl font-medium">
								{numberFormatter.format(streakDays)}
							</p>
						</CardContent>
					</Card>
				</section>

				<UsageBars days={dailyUsage} />

				<ProfileTabs
					tools={toolBreakdown}
					notes={notes}
					achievements={profileAchievements}
				/>
			</div>
		</main>
	);
}
