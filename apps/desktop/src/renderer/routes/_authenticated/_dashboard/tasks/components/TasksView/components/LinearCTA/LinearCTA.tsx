import { Button } from "@rox/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { LuX } from "react-icons/lu";
import { SiLinear } from "react-icons/si";

interface LinearCTAProps {
	/**
	 * `full` (default) = the centered takeover card. `banner` = a thin dismissed
	 * strip so the founder can still reach the PR / Issues tabs while Linear is
	 * disconnected (the type tabs live in the top bar above this).
	 */
	variant?: "full" | "banner";
	/** Collapse the full card to the thin banner. Only used by `full`. */
	onDismiss?: () => void;
}

export function LinearCTA({ variant = "full", onDismiss }: LinearCTAProps) {
	const navigate = useNavigate();

	const handleConnectLinear = () => {
		navigate({ to: "/settings/integrations" });
	};

	if (variant === "banner") {
		return (
			<div className="flex items-center gap-2 border-b border-border/60 bg-card/40 px-4 py-2 text-sm backdrop-blur-xl">
				<SiLinear className="size-4 shrink-0 text-muted-foreground" />
				<span className="text-muted-foreground">
					Linear не подключён — задачи недоступны.
				</span>
				<Button
					variant="link"
					size="sm"
					className="h-auto p-0 text-sm"
					onClick={handleConnectLinear}
				>
					Подключить
				</Button>
			</div>
		);
	}

	return (
		<div className="relative flex-1 flex items-center justify-center p-6">
			{onDismiss && (
				<Button
					variant="ghost"
					size="icon-xs"
					title="Свернуть"
					className="absolute right-3 top-3"
					onClick={onDismiss}
				>
					<LuX className="size-4" />
				</Button>
			)}
			<div className="flex flex-col items-center gap-4 max-w-md text-center">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-muted/50">
					<SiLinear className="size-8" />
				</div>
				<div className="space-y-2">
					<h3 className="text-lg font-semibold">Подключить Linear</h3>
					<p className="text-sm text-muted-foreground">
						Подключите рабочее пространство Linear, чтобы синхронизировать
						Issues и управлять задачами прямо из Rox.
					</p>
				</div>
				<Button onClick={handleConnectLinear}>Подключить Linear</Button>
			</div>
		</div>
	);
}
