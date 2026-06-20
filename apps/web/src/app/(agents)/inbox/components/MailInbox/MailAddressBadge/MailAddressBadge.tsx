"use client";

import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { AtSign, Check, Copy } from "lucide-react";
import { useState } from "react";

import { useMailAddress } from "../../../hooks/useMailAddress";

/**
 * The "your email address" affordance: shows the caller's `<handle>@rox.one`
 * mailbox identity with a copy control, or a claim button when the address has
 * not been provisioned yet (e.g. the user has no handle set). Driven by
 * `useMailAddress`, which wraps the idempotent `mail.provisionAddress`.
 */
export function MailAddressBadge() {
	const { address, needsHandle, isProvisioning, provision } = useMailAddress();
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		if (!address) return;
		try {
			await navigator.clipboard.writeText(address);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			toast.error("Не удалось скопировать адрес");
		}
	};

	if (address) {
		return (
			<Badge
				variant="secondary"
				className="gap-1.5 font-mono text-[11px] font-medium"
			>
				<AtSign className="size-3" />
				<span className="max-w-44 truncate">{address}</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="-mr-1 size-4"
					aria-label="Скопировать адрес"
					onClick={handleCopy}
				>
					{copied ? (
						<Check className="size-3 text-primary" />
					) : (
						<Copy className="size-3" />
					)}
				</Button>
			</Badge>
		);
	}

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="h-7 gap-1.5 text-xs"
			disabled={isProvisioning}
			onClick={() => provision()}
		>
			<AtSign className="size-3.5" />
			{needsHandle
				? "Задайте handle для адреса"
				: isProvisioning
					? "Получаем адрес…"
					: "Получить адрес @rox.one"}
		</Button>
	);
}
