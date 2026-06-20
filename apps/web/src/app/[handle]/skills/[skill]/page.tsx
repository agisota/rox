import { parseSharePath } from "@rox/shared/share-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileHeader } from "../../components/ProfileHeader";
import { getPublicProfile } from "../../lib/profile-data";
import {
	getPublicSkillBySlug,
	type PublicSkillFile,
} from "../../lib/profile-skills";
import { resolveHandleParam } from "../../lib/resolve-handle";

type SkillPageProps = {
	params: Promise<{ handle: string; skill: string }>;
};

export const dynamic = "force-dynamic";

/**
 * `/@<handle>/skills/<skilltitle>` — resolve the handle + skill slug via the
 * shared `parseSharePath` resolver, then render the skill as a folder of files
 * (`SKILL.md` + `examples/…`) projected from the owner's public skill version.
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

/** Group files by their logical folder, root ("") first. */
function groupByFolder(
	files: PublicSkillFile[],
): { folder: string; files: PublicSkillFile[] }[] {
	const groups = new Map<string, PublicSkillFile[]>();
	for (const file of files) {
		const existing = groups.get(file.folder);
		if (existing) existing.push(file);
		else groups.set(file.folder, [file]);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
		.map(([folder, folderFiles]) => ({ folder, files: folderFiles }));
}

export default async function ProfileSkillPage({ params }: SkillPageProps) {
	const { handle: segment, skill } = await params;
	const handle = resolveHandleParam(segment);
	if (!handle) notFound();

	const resolvedSlug = resolveSkill(segment, skill);
	if (!resolvedSlug) notFound();

	const profile = await getPublicProfile(handle);
	if (!profile) notFound();

	const skillDetail = await getPublicSkillBySlug(profile.userId, resolvedSlug);
	if (!skillDetail) notFound();

	const folders = groupByFolder(skillDetail.files);

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				<ProfileHeader profile={profile} activeSection="skills" />
				<section className="rounded-xl border bg-card p-6">
					<div className="flex items-center gap-2">
						{skillDetail.icon ? (
							<span aria-hidden="true" className="text-xl">
								{skillDetail.icon}
							</span>
						) : null}
						<h1 className="text-xl font-medium">{skillDetail.name}</h1>
					</div>
					{skillDetail.description ? (
						<p className="mt-2 text-sm text-muted-foreground">
							{skillDetail.description}
						</p>
					) : null}
					<p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
						{skillDetail.category ?? skillDetail.kind}
					</p>
				</section>

				{folders.length === 0 ? (
					<section className="rounded-xl border bg-card p-6">
						<p className="text-sm text-muted-foreground">
							У этого навыка пока нет опубликованного содержимого.
						</p>
					</section>
				) : (
					folders.map(({ folder, files }) => (
						<section key={folder || "root"} className="flex flex-col gap-3">
							<h2 className="font-mono text-sm text-muted-foreground">
								{folder ? `${folder}/` : `${skillDetail.slug}/`}
							</h2>
							{files.map((file) => (
								<article
									key={`${folder}/${file.name}`}
									className="rounded-xl border bg-card p-5"
								>
									<h3 className="mb-3 font-mono text-sm font-medium">
										{file.name}
									</h3>
									<pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-mono text-sm leading-7 text-foreground">
										{file.content}
									</pre>
								</article>
							))}
						</section>
					))
				)}
			</div>
		</main>
	);
}
