export interface ArtifactDisplayRow {
	id: string;
	title?: string | null;
	createdAt?: Date | string | null;
}

export interface ArtifactShareCandidate {
	resourceType: string;
	resourceId: string;
	revokedAt?: Date | string | null;
	url: string;
}

function toTime(value: Date | string | null | undefined): number {
	if (!value) return 0;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function getArtifactDisplayTitle(artifact: ArtifactDisplayRow): string {
	return artifact.title?.trim() || `Artifact ${artifact.id.slice(0, 8)}`;
}

export function sortArtifactsByNewest<T extends ArtifactDisplayRow>(
	artifacts: readonly T[],
): T[] {
	return [...artifacts].sort(
		(left, right) => toTime(right.createdAt) - toTime(left.createdAt),
	);
}

export function findActiveArtifactShare<T extends ArtifactShareCandidate>(
	shares: readonly T[],
	artifactId: string,
): T | null {
	return (
		shares.find(
			(share) =>
				share.resourceType === "artifact" &&
				share.resourceId === artifactId &&
				!share.revokedAt,
		) ?? null
	);
}
