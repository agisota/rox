import { Avatar } from "@rox/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import {
	WorkspaceSwitcher,
	WorkspaceSwitcherIcons,
} from "@rox/ui/workspace-switcher";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { FiUsers } from "react-icons/fi";
import {
	HiChevronUpDown,
	HiOutlineArrowRightOnRectangle,
	HiOutlineCog6Tooth,
} from "react-icons/hi2";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import { useSignOut } from "renderer/hooks/useSignOut";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export function OrganizationDropdown({
	variant = "topbar",
}: {
	variant?: "topbar" | "expanded" | "collapsed";
}) {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const signOut = useSignOut();
	const navigate = useNavigate();

	const activeOrganizationId = session?.session?.activeOrganizationId;

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const activeOrganization = organizations?.find(
		(o) => o.id === activeOrganizationId,
	);

	async function handleSignOut(): Promise<void> {
		await signOut();
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
						<DropdownMenuSubContent className="p-0">
							<WorkspaceSwitcher
								className="w-64"
								activeId={activeOrganizationId}
								options={organizations.map((organization) => ({
									id: organization.id,
									name: organization.name,
									path: organization.slug,
									logo: organization.logo,
								}))}
								onSelect={(id) => collections.switchOrganization(id)}
								footerActions={[
									{
										id: "new-worktree",
										label: "Создать организацию",
										icon: WorkspaceSwitcherIcons.newWorktree,
										onSelect: () => navigate({ to: "/create-organization" }),
									},
									{
										id: "manage",
										label: "Управление",
										icon: WorkspaceSwitcherIcons.manage,
										onSelect: () => navigate({ to: "/settings/organization" }),
									},
								]}
							/>
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
