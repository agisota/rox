import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileEmptyState } from "../components/ProfileEmptyState";
import { ProfileHeader } from "../components/ProfileHeader";
import { getPublicProfile } from "../lib/profile-data";
import { getPublicSkills } from "../lib/profile-skills";
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

	const skills = await getPublicSkills(profile.userId);

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				<ProfileHeader profile={profile} activeSection="skills" />
				{skills.length === 0 ? (
					<ProfileEmptyState title="Навыки" />
				) : (
					<section className="grid gap-3 sm:grid-cols-2">
						{skills.map((skill) => (
							<Link
								key={skill.id}
								href={`/@${handle}/skills/${skill.slug}`}
								className="group flex flex-col gap-2 rounded-xl border bg-card p-5 transition-colors hover:border-primary"
							>
								<div className="flex items-center gap-2">
									{skill.icon ? (
										<span aria-hidden="true" className="text-lg">
											{skill.icon}
										</span>
									) : null}
									<h2 className="text-base font-medium group-hover:text-primary">
										{skill.name}
									</h2>
								</div>
								{skill.description ? (
									<p className="line-clamp-3 text-sm text-muted-foreground">
										{skill.description}
									</p>
								) : null}
								<span className="mt-auto text-xs uppercase tracking-wide text-muted-foreground">
									{skill.category ?? skill.kind}
								</span>
							</Link>
						))}
					</section>
				)}
			</div>
		</main>
	);
}
