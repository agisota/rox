import type { ShareSection } from "@rox/shared/share-link";
import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Badge } from "@rox/ui/badge";
import Link from "next/link";
import { platformLabel } from "../../lib/platform";
import type { PublicProfile } from "../../lib/profile-data";

/** Tabs/sections rendered in the public profile nav (ROX-522). */
const SECTION_NAV: { section: ShareSection | "skills"; label: string }[] = [
	{ section: "agents", label: "Агенты" },
	{ section: "subagents", label: "Сабагенты" },
	{ section: "hooks", label: "Хуки" },
	{ section: "drive", label: "Диск" },
	{ section: "feed", label: "Лента" },
	{ section: "projects", label: "Проекты" },
	{ section: "stats", label: "Статистика" },
	{ section: "skills", label: "Навыки" },
];

function getInitials(displayName: string): string {
	return displayName
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
}

export type ProfileHeaderProps = {
	profile: Pick<
		PublicProfile,
		| "handle"
		| "displayName"
		| "avatarUrl"
		| "registrationProvider"
		| "bio"
		| "location"
	>;
	/** Active section for nav highlighting; omit on the root profile page. */
	activeSection?: ShareSection | "skills";
};

export function ProfileHeader({ profile, activeSection }: ProfileHeaderProps) {
	const platform = platformLabel(profile.registrationProvider);

	return (
		<header className="flex flex-col gap-5">
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
				<div className="min-w-0 space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-2xl font-medium tracking-tight">
							{profile.displayName}
						</h1>
						{platform && <Badge variant="secondary">Через {platform}</Badge>}
					</div>
					<p className="text-sm text-muted-foreground">@{profile.handle}</p>
					{profile.location && (
						<p className="text-sm text-muted-foreground">{profile.location}</p>
					)}
					{profile.bio && (
						<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
							{profile.bio}
						</p>
					)}
				</div>
			</div>

			<nav
				aria-label="Разделы профиля"
				className="flex w-full gap-1 overflow-x-auto border-b pb-px"
			>
				{SECTION_NAV.map(({ section, label }) => {
					const isActive = section === activeSection;
					const href =
						section === "skills"
							? `/@${profile.handle}/skills`
							: `/@${profile.handle}/${section}`;
					return (
						<Link
							key={section}
							href={href}
							aria-current={isActive ? "page" : undefined}
							className={
								isActive
									? "whitespace-nowrap border-b-2 border-primary px-3 py-2 text-sm font-medium"
									: "whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
							}
						>
							{label}
						</Link>
					);
				})}
			</nav>
		</header>
	);
}

export { SECTION_NAV };
