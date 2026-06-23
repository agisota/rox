import {
	parseSharePath,
	SHARE_SECTIONS,
	type ShareSection,
} from "@rox/shared/share-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileEmptyState } from "../components/ProfileEmptyState";
import { ProfileHeader } from "../components/ProfileHeader";
import { getPublicProfile } from "../lib/profile-data";
import { resolveHandleParam } from "../lib/resolve-handle";

type SectionPageProps = {
	params: Promise<{ handle: string; section: string }>;
};

export const dynamic = "force-dynamic";

const SECTION_TITLES: Record<ShareSection, string> = {
	agents: "Агенты",
	subagents: "Сабагенты",
	hooks: "Хуки",
	drive: "Диск",
	feed: "Лента",
	projects: "Проекты",
	stats: "Статистика",
};

/**
 * Resolve `/@<handle>/<section>` via the shared `parseSharePath` resolver and
 * the profile lookup.
 *
 * These sections (agents/subagents/hooks/drive/feed/projects/stats) have no
 * per-user public data model yet — there is no owner-scoped, public-by-flag
 * collection to read from without exposing private/tenant data. They render a
 * clear "Пока пусто" empty-state until a public model lands. SKILLS and SHARED
 * sessions/artifacts (which DO have public models) are wired in their own routes.
 */
function resolveSection(segment: string, section: string): ShareSection | null {
	const parsed = parseSharePath(`/${segment}/${section}`);
	if (parsed?.kind !== "section") return null;
	return parsed.section;
}

export async function generateMetadata({
	params,
}: SectionPageProps): Promise<Metadata> {
	const { handle: segment, section } = await params;
	const handle = resolveHandleParam(segment);
	const resolved = resolveSection(segment, section);
	if (!handle || !resolved) {
		return { title: "Профиль не найден · Rox" };
	}
	return { title: `${SECTION_TITLES[resolved]} · @${handle} · Rox` };
}

export default async function ProfileSectionPage({ params }: SectionPageProps) {
	const { handle: segment, section } = await params;
	const handle = resolveHandleParam(segment);
	if (!handle) notFound();

	const resolved = resolveSection(segment, section);
	if (!resolved || !SHARE_SECTIONS.includes(resolved)) notFound();

	const profile = await getPublicProfile(handle);
	if (!profile) notFound();

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				<ProfileHeader profile={profile} activeSection={resolved} />
				<ProfileEmptyState title={SECTION_TITLES[resolved]} />
			</div>
		</main>
	);
}
