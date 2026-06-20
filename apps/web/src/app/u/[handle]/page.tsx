import { permanentRedirect } from "next/navigation";

type LegacyProfilePageProps = {
	params: Promise<{ handle: string }>;
};

/**
 * Legacy public-profile URL. The canonical profile now lives at the
 * `@<handle>` namespace (`/@<handle>`, ROX-522 Phase 2). Redirect old
 * `/u/<handle>` links to the new canonical form. The data layer moved to
 * `app/[handle]/lib/profile-data.ts`.
 */
export default async function LegacyProfilePage({
	params,
}: LegacyProfilePageProps) {
	const { handle } = await params;
	permanentRedirect(`/@${handle}`);
}
