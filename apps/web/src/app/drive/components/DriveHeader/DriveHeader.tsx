"use client";

import { authClient } from "@rox/auth/client";
import { Button } from "@rox/ui/button";
import { HardDrive, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Minimal header for the Drive surface: brand link back to the cabinet, the
 * Drive title, and a sign-out action. Kept self-contained so the route group
 * does not depend on the flag-gated agents chrome.
 */
export function DriveHeader() {
	const router = useRouter();

	const handleSignOut = async () => {
		try {
			await authClient.signOut();
			router.push("/sign-in");
		} catch (error) {
			console.error("[DriveHeader] sign out failed", error);
		}
	};

	return (
		<header className="sticky top-0 z-40 w-full border-border/50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-12 w-full max-w-screen-2xl items-center justify-between px-4">
				<div className="flex items-center gap-2">
					<HardDrive className="size-5 text-foreground" />
					<Link href="/drive" className="font-medium text-foreground text-sm">
						Диск
					</Link>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => void handleSignOut()}
				>
					<LogOut className="size-4" />
					Выйти
				</Button>
			</div>
		</header>
	);
}
