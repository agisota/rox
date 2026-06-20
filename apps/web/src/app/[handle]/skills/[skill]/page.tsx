import { parseSharePath } from "@rox/shared/share-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileHeader } from "../../components/ProfileHeader";
import { getPublicProfile } from "../../lib/profile-data";
import { resolveHandleParam } from "../../lib/resolve-handle";

type SkillPageProps = {
	params: Promise<{ handle: string; skill: string }>;
};

export const dynamic = "force-dynamic";

/**
 * `/@<handle>/skills/<skilltitle>` — resolve the handle + skill slug via the
 * shared `parseSharePath` resolver, then render a placeholder for the skill.
 * The actual skill-content wiring is a follow-up; this PR delivers the public
 * routing + handle resolution.
 */
function resolveSkill(segment: string, skill: string): string | null {
	const parsed = parseSharePath(`/${segment}/skills/${skill}`);
	if (parsed?.kind !== "skill") return null;
	return parsed.skill;
}

export async function generateMetadata({
	params,
}: SkillPageProps): Promise<Metadata> {
	const { handle: segment, skill } = await params;
	const handle = resolveHandleParam(segment);
	const resolved = resolveSkill(segment, skill);
	if (!handle || !resolved) return { title: "Навык не найден · Rox" };
	return { title: `${resolved} · @${handle} · Rox` };
}

export default async function ProfileSkillPage({ params }: SkillPageProps) {
	const { handle: segment, skill } = await params;
	const handle = resolveHandleParam(segment);
	if (!handle) notFound();

	const resolvedSkill = resolveSkill(segment, skill);
	if (!resolvedSkill) notFound();

	const profile = await getPublicProfile(handle);
	if (!profile) notFound();

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				<ProfileHeader profile={profile} activeSection="skills" />
				<section className="rounded-xl border bg-card p-6">
					<h2 className="text-lg font-medium">{resolvedSkill}</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						Содержимое навыка скоро появится.
					</p>
				</section>
			</div>
		</main>
	);
}
