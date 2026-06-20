"use client";

import { authClient } from "@rox/auth/client";
import { Button } from "@rox/ui/button";
import { LogOut, NotebookPen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Minimal header for the Notes surface: brand link, title, and a sign-out
 * action. Self-contained so the route does not depend on the flag-gated agents
 * chrome (mirrors DriveHeader).
 */
export function NotesHeader() {
	const router = useRouter();

	const handleSignOut = async () => {
		try {
			await authClient.signOut();
			router.push("/sign-in");
		} catch (error) {
			console.error("[NotesHeader] sign out failed", error);
		}
	};

	return (
		<header className="sticky top-0 z-40 w-full border-border/50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-12 w-full max-w-screen-2xl items-center justify-between px-4">
				<div className="flex items-center gap-2">
					<NotebookPen className="size-5 text-foreground" />
					<Link href="/notes" className="font-medium text-foreground text-sm">
						Заметки
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
