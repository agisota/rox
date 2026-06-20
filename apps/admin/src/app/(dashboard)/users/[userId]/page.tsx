import { UserDetail } from "./components/UserDetail";

export default async function UserDetailPage({
	params,
}: {
	params: Promise<{ userId: string }>;
}) {
	const { userId } = await params;

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">User</h1>
				<p className="text-muted-foreground">
					Per-user drilldown: profile, balance, usage, sessions, and flags
				</p>
			</div>
			<UserDetail userId={userId} />
		</div>
	);
}
