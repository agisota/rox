import { COMPANY } from "@superset/shared/constants";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@superset/ui/sidebar";
import Image from "next/image";

export function AppSidebarHeader() {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton size="lg" asChild>
					<a href="/">
						<Image
							src="/icon.png"
							alt={COMPANY.NAME}
							width={32}
							height={32}
							className="size-8 rounded-lg"
						/>
						<div className="flex flex-col gap-0.5 leading-none">
							<span className="font-medium">{COMPANY.NAME}</span>
						</div>
					</a>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
