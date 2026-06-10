import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { useCallback } from "react";
import type {
	LinkAction,
	LinkTier,
	LinkTierMap,
	Surface,
} from "renderer/lib/clickPolicy";

type SlotValue = LinkAction | "none";

const TIERS: LinkTier[] = ["plain", "shift", "meta", "metaShift"];
const ACTIONS: LinkAction[] = ["pane", "newTab", "external"];

const FILE_ACTION_LABELS: Record<LinkAction, string> = {
	pane: "Открыть во вкладке",
	newTab: "Открыть в новой вкладке",
	external: "Открыть в редакторе",
};

const URL_ACTION_LABELS: Record<LinkAction, string> = {
	pane: "Открыть во встроенном браузере",
	newTab: "Открыть в новой вкладке браузера",
	external: "Открыть в браузере по умолчанию",
};

const isMac =
	typeof navigator !== "undefined" &&
	navigator.platform.toLowerCase().includes("mac");

const MAC_MODIFIER_LABELS: Record<LinkTier, string> = {
	plain: "Клик",
	shift: "⇧ клик",
	meta: "⌘ клик",
	metaShift: "⌘⇧ клик",
};

const NON_MAC_MODIFIER_LABELS: Record<LinkTier, string> = {
	plain: "Клик",
	shift: "Shift+клик",
	meta: "Ctrl+клик",
	metaShift: "Ctrl+Shift+клик",
};

const MODIFIER_LABELS = isMac ? MAC_MODIFIER_LABELS : NON_MAC_MODIFIER_LABELS;

function localizedActionLabel(action: LinkAction, surface: Surface) {
	return surface === "file"
		? FILE_ACTION_LABELS[action]
		: URL_ACTION_LABELS[action];
}

function toSlot(action: LinkAction | null): SlotValue {
	return action ?? "none";
}

function fromSlot(slot: SlotValue): LinkAction | null {
	return slot === "none" ? null : slot;
}

export interface LinkTierMapperProps {
	title: string;
	description: string;
	value: LinkTierMap;
	onChange: (next: LinkTierMap) => void;
	idPrefix: string;
	surface: Surface;
}

export function LinkTierMapper({
	title,
	description,
	value,
	onChange,
	idPrefix,
	surface,
}: LinkTierMapperProps) {
	const pick = useCallback(
		(tier: LinkTier, nextSlot: SlotValue) => {
			const nextAction = fromSlot(nextSlot);
			if (value[tier] === nextAction) return;
			onChange({ ...value, [tier]: nextAction });
		},
		[value, onChange],
	);

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">{title}</h3>
			<p className="text-xs text-muted-foreground mb-3">{description}</p>
			<div className="space-y-2">
				{TIERS.map((tier) => {
					const id = `${idPrefix}-${tier}`;
					return (
						<div key={tier} className="flex items-center justify-between gap-4">
							<Label htmlFor={id} className="text-sm font-medium capitalize">
								{MODIFIER_LABELS[tier]}
							</Label>
							<Select
								value={toSlot(value[tier])}
								onValueChange={(v) => pick(tier, v as SlotValue)}
							>
								<SelectTrigger id={id} size="sm" className="w-44">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Ничего не делать</SelectItem>
									{ACTIONS.map((action) => (
										<SelectItem key={action} value={action}>
											{localizedActionLabel(action, surface)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					);
				})}
			</div>
		</div>
	);
}
