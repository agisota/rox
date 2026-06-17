import { Avatar } from "@rox/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { FiUsers } from "react-icons/fi";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineArrowRightOnRectangle,
	HiOutlineCog6Tooth,
	HiOutlinePlus,
} from "react-icons/hi2";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export function OrganizationDropdown({
	variant = "topbar",
}: {
	variant?: "topbar" | "expanded" | "collapsed";
}) {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const signOutMutation = electronTrpc.auth.signOut.useMutation();
	const navigate = useNavigate();

	const activeOrganizationId = session?.session?.activeOrganizationId;

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const activeOrganization = organizations?.find(
		(o) => o.id === activeOrganizationId,
	);

	const userEmail = session?.user?.email;

	async function handleSignOut(): Promise<void> {
		await authClient.signOut();
		signOutMutation.mutate();
	}

	const userName = session?.user?.name;
	const displayName = activeOrganization?.name ?? userName ?? "Организация";

	const triggerButton =
		variant === "collapsed" ? (
			<button
				type="button"
				className="flex size-8 items-center justify-center rounded-md transition-colors text-muted-foreground hover:bg-accent/50 hover:text-foreground"
				aria-label="Меню организации"
			>
				<Avatar
					size="xs"
					fullName={activeOrganization?.name}
					image={activeOrganization?.logo}
					className="rounded size-4"
				/>
			</button>
		) : variant === "expanded" ? (
			<button
				type="button"
				className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground min-w-0"
				aria-label="Меню организации"
			>
				<Avatar
					size="xs"
					fullName={activeOrganization?.name}
					image={activeOrganization?.logo}
					className="rounded size-4 shrink-0"
				/>
				<span className="truncate">{displayName}</span>
				<HiChevronUpDown className="ml-auto h-3.5 w-3.5 text-muted-foreground shrink-0" />
			</button>
		) : (
			<button
				type="button"
				className="group no-drag flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring"
				aria-label="Меню организации"
			>
				<Avatar
					size="xs"
					fullName={activeOrganization?.name}
					image={activeOrganization?.logo}
					className="rounded size-4"
				/>
				<span className="text-xs font-medium truncate max-w-32">
					{displayName}
				</span>
				<HiChevronUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
			</button>
		);

	const contentAlign = variant === "topbar" ? "end" : "start";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
			<DropdownMenuContent
				align={contentAlign}
				className={
					variant === "expanded"
						? "w-[var(--radix-dropdown-menu-trigger-width)] min-w-56"
						: "w-56"
				}
			>
				{/* Organization */}
				{/* TODO(v1): Settings lives in the sidebar footer in v2; kept here for v1. Remove once v1 is gone. */}
				<DropdownMenuItem
					onSelect={() => navigate({ to: "/settings/account" })}
				>
					<HiOutlineCog6Tooth className="h-4 w-4" />
					<span>Настройки</span>
					<HotkeyMenuShortcut hotkeyId="OPEN_SETTINGS" />
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => navigate({ to: "/settings/organization" })}
				>
					<FiUsers className="h-4 w-4" />
					<span>Участники</span>
				</DropdownMenuItem>
				{organizations && organizations.length > 0 && (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="gap-2">
							<span>Сменить организацию</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{userEmail && (
								<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
									{userEmail}
								</DropdownMenuLabel>
							)}
							{organizations.map((organization) => (
								<DropdownMenuItem
									key={organization.id}
									onSelect={() =>
										collections.switchOrganization(organization.id)
									}
									className="gap-2"
								>
									<Avatar
										size="xs"
										fullName={organization.name}
										image={organization.logo}
										className="rounded-md"
									/>
									<span className="flex-1 truncate">{organization.name}</span>
									{organization.id === activeOrganization?.id && (
										<HiCheck className="h-4 w-4 text-primary" />
									)}
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onSelect={() => navigate({ to: "/create-organization" })}
							>
								<HiOutlinePlus className="h-4 w-4" />
								<span>Создать организацию</span>
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}

				<DropdownMenuSeparator />

				{/* Account */}
				<DropdownMenuItem onSelect={handleSignOut} className="gap-2">
					<HiOutlineArrowRightOnRectangle className="h-4 w-4" />
					<span>Выйти</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
