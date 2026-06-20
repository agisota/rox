import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileHeader } from "../components/ProfileHeader";
import { getPublicProfile } from "../lib/profile-data";
import { resolveHandleParam } from "../lib/resolve-handle";

type SkillsPageProps = {
	params: Promise<{ handle: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: SkillsPageProps): Promise<Metadata> {
	const { handle: segment } = await params;
	const handle = resolveHandleParam(segment);
	if (!handle) return { title: "Профиль не найден · Rox" };
	return { title: `Навыки · @${handle} · Rox` };
}

export default async function ProfileSkillsPage({ params }: SkillsPageProps) {
	const { handle: segment } = await params;
	const handle = resolveHandleParam(segment);
	if (!handle) notFound();

	const profile = await getPublicProfile(handle);
	if (!profile) notFound();

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				<ProfileHeader profile={profile} activeSection="skills" />
				<section className="rounded-xl border bg-card p-6">
					<h2 className="text-lg font-medium">Навыки</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						Опубликованные навыки скоро появятся.
					</p>
				</section>
			</div>
		</main>
	);
}
