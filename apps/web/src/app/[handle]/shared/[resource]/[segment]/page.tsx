import {
	type ParsedSharedResource,
	parseSharePath,
} from "@rox/shared/share-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileHeader } from "../../../components/ProfileHeader";
import { getPublicProfile } from "../../../lib/profile-data";
import { resolveHandleParam } from "../../../lib/resolve-handle";

type SharedResourcePageProps = {
	params: Promise<{ handle: string; resource: string; segment: string }>;
};

export const dynamic = "force-dynamic";

const RESOURCE_LABELS: Record<ParsedSharedResource["resource"], string> = {
	sessions: "Сессия",
	artifacts: "Артефакт",
};

/**
 * `/@<handle>/shared/<resource>/<id>-<slug>-<DD>-<MM>-<YYYY>` — resolve the
 * handle + shared-resource descriptor via the shared `parseSharePath` resolver.
 * The actual session/artifact content wiring is a follow-up; this PR delivers
 * the public routing + handle resolution + an empty-state placeholder.
 */
function resolveShared(
	handleSegment: string,
	resource: string,
	segment: string,
): ParsedSharedResource | null {
	const parsed = parseSharePath(
		`/${handleSegment}/shared/${resource}/${segment}`,
	);
	if (parsed?.kind !== "shared_resource") return null;
	return parsed;
}

export async function generateMetadata({
	params,
}: SharedResourcePageProps): Promise<Metadata> {
	const { handle: handleSegment, resource, segment } = await params;
	const handle = resolveHandleParam(handleSegment);
	const parsed = resolveShared(handleSegment, resource, segment);
	if (!handle || !parsed) return { title: "Публикация не найдена · Rox" };
	return {
		title: `${RESOURCE_LABELS[parsed.resource]} · @${handle} · Rox`,
	};
}

export default async function SharedResourcePage({
	params,
}: SharedResourcePageProps) {
	const { handle: handleSegment, resource, segment } = await params;
	const handle = resolveHandleParam(handleSegment);
	if (!handle) notFound();

	const parsed = resolveShared(handleSegment, resource, segment);
	if (!parsed) notFound();

	const profile = await getPublicProfile(handle);
	if (!profile) notFound();

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				<ProfileHeader profile={profile} />
				<section className="rounded-xl border bg-card p-6">
					<h2 className="text-lg font-medium">
						{RESOURCE_LABELS[parsed.resource]}
					</h2>
					<p className="mt-2 break-all font-mono text-sm text-muted-foreground">
						{parsed.id}
						{parsed.slug ? `-${parsed.slug}` : ""}
					</p>
					<p className="mt-2 text-sm text-muted-foreground">
						Содержимое публикации скоро появится.
					</p>
				</section>
			</div>
		</main>
	);
}
