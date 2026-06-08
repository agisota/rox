import { Badge } from "@rox/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { FaBookOpen } from "react-icons/fa";
import { api } from "@/trpc/server";
import { ConnectionControls } from "./components/ConnectionControls";

export default async function FiberyIntegrationPage() {
	const trpc = await api();
	const organization = await trpc.user.myOrganization.query();

	if (!organization) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<p className="text-muted-foreground">
					You need to be part of an organization to use integrations.
				</p>
			</div>
		);
	}

	const connection = await trpc.integration.fibery.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection;

	return (
		<div className="space-y-8">
			<Link
				href="/integrations"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Back to Integrations
			</Link>

			<div className="flex items-start gap-6">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-card p-3">
					<FaBookOpen className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Fibery</h1>
						{isConnected ? (
							<Badge variant="default" className="gap-1">
								<CheckCircle2 className="size-3" />
								Connected
							</Badge>
						) : (
							<Badge variant="secondary">Not Connected</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">
						Connect a Fibery workspace with a per-account token to sync work
						items with agents.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Connection</CardTitle>
					<CardDescription>
						Enter your Fibery account subdomain and an API token to connect.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
					/>
					{connection && (
						<div className="mt-4 text-sm text-muted-foreground">
							Connected to{" "}
							<span className="font-medium">{connection.externalOrgName}</span>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
