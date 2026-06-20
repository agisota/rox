import {
	type ParsedSharedResource,
	parseSharePath,
} from "@rox/shared/share-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileHeader } from "../../../components/ProfileHeader";
import { SharedResourceContent } from "../../../components/SharedResourceContent";
import { getPublicProfile } from "../../../lib/profile-data";
import { getPublicSharedResource } from "../../../lib/profile-shared";
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
 * handle + shared-resource descriptor via the shared `parseSharePath` resolver,
 * then look up the owner's matching non-revoked `public_shares` snapshot and
 * render its immutable public payload (read-only).
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

	const shared = await getPublicSharedResource({
		ownerUserId: profile.userId,
		resource: parsed.resource,
		id: parsed.id,
	});

	const publishedAt = shared
		? new Intl.DateTimeFormat("ru", {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(shared.createdAt)
		: null;

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				<ProfileHeader profile={profile} />
				<section className="rounded-xl border bg-card p-6">
					<div className="flex flex-wrap items-baseline gap-3">
						<h2 className="text-lg font-medium">
							{shared?.title ?? RESOURCE_LABELS[parsed.resource]}
						</h2>
						{publishedAt ? (
							<span className="text-xs text-muted-foreground">
								{publishedAt}
							</span>
						) : null}
					</div>
					<div className="mt-4">
						{shared ? (
							<SharedResourceContent resource={shared} />
						) : (
							<p className="text-sm text-muted-foreground">
								Эта публикация недоступна или была отозвана.
							</p>
						)}
					</div>
				</section>
			</div>
		</main>
	);
}
