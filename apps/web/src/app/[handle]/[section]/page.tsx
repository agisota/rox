import {
	parseSharePath,
	SHARE_SECTIONS,
	type ShareSection,
} from "@rox/shared/share-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
 * the profile lookup. Section content is a stub/empty-state for now — this PR
 * wires the routing + handle resolution + profile header; the per-section data
 * is a follow-up.
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
				<section className="rounded-xl border bg-card p-6">
					<h2 className="text-lg font-medium">{SECTION_TITLES[resolved]}</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						Раздел «{SECTION_TITLES[resolved]}» скоро появится.
					</p>
				</section>
			</div>
		</main>
	);
}
