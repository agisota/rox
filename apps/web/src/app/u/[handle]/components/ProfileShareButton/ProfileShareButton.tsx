"use client";

import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { Share2 } from "lucide-react";

type ProfileShareButtonProps = {
	url: string;
};

export function ProfileShareButton({ url }: ProfileShareButtonProps) {
	async function copyProfileUrl() {
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Ссылка на профиль скопирована");
		} catch {
			toast.error("Не удалось скопировать ссылку");
		}
	}

	return (
		<Button type="button" variant="outline" onClick={copyProfileUrl}>
			<Share2 className="size-4" />
			Поделиться
		</Button>
	);
}
