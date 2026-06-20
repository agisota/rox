import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileHeader } from "./components/ProfileHeader";
import { getPublicProfile } from "./lib/profile-data";
import { resolveHandleParam } from "./lib/resolve-handle";

type ProfilePageProps = {
	params: Promise<{ handle: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: ProfilePageProps): Promise<Metadata> {
	const { handle: segment } = await params;
	const handle = resolveHandleParam(segment);
	if (!handle) {
		return { title: "Профиль не найден · Rox" };
	}

	const profile = await getPublicProfile(handle);
	if (!profile) {
		return { title: "Профиль не найден · Rox" };
	}

	return {
		title: `${profile.displayName} (@${profile.handle}) · Rox`,
		description:
			profile.bio ?? "Публичный профиль Rox: агенты, проекты и активность.",
	};
}

export default async function ProfilePage({ params }: ProfilePageProps) {
	const { handle: segment } = await params;
	const handle = resolveHandleParam(segment);
	if (!handle) notFound();

	const profile = await getPublicProfile(handle);
	if (!profile) notFound();

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				<ProfileHeader profile={profile} />
				<section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
					Выберите раздел выше, чтобы увидеть агентов, проекты и активность
					пользователя.
				</section>
			</div>
		</main>
	);
}
