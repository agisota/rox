import { ActivityItem } from "./components/ActivityItem";

interface ActivitySectionProps {
	createdAt: Date;
	creatorName: string;
	creatorAvatarUrl?: string | null;
}

export function ActivitySection({
	createdAt,
	creatorName,
	creatorAvatarUrl,
}: ActivitySectionProps) {
	return (
		<div className="space-y-3">
			<ActivityItem
				avatarUrl={creatorAvatarUrl}
				avatarFallback={creatorName.charAt(0).toUpperCase()}
				actorName={creatorName}
				action="создал(а) задачу"
				timestamp={createdAt}
			/>
		</div>
	);
}
