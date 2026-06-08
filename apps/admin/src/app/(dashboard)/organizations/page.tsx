import { CreateOrganizationDialog } from "./components/CreateOrganizationDialog";
import { OrganizationsList } from "./components/OrganizationsList";

export default function OrganizationsPage() {
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
					<p className="text-muted-foreground">
						Manage organizations and their members
					</p>
				</div>
				<CreateOrganizationDialog />
			</div>
			<OrganizationsList />
		</div>
	);
}
