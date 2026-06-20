import { CommandItem, CommandShortcut } from "@rox/ui/command";
import { useHotkeyDisplay } from "renderer/hotkeys/hooks/useHotkeyDisplay";
import type { Command } from "../../core/types";

interface CommandItemRowProps {
	command: Command;
	onSelect: (command: Command) => void;
}

export function CommandItemRow({ command, onSelect }: CommandItemRowProps) {
	const display = useHotkeyDisplay(command.hotkeyId ?? "");
	const Icon = command.icon;
	const hasShortcut =
		Boolean(command.hotkeyId) && display.text && display.text !== "Unassigned";
	return (
		<CommandItem
			value={`${command.id} ${command.title} ${(command.keywords ?? []).join(" ")}`}
			disabled={command.disabled}
			onSelect={() => {
				if (command.disabled) return;
				onSelect(command);
			}}
		>
			{command.iconUrl ? (
				<img
					src={command.iconUrl}
					alt=""
					className="size-4 shrink-0 object-contain"
				/>
			) : Icon ? (
				<Icon />
			) : null}
			<span className="min-w-0 flex-1">
				<span className="block truncate">{command.title}</span>
				{command.disabled && command.disabledReason ? (
					<span className="block truncate text-muted-foreground text-xs">
						{command.disabledReason}
					</span>
				) : null}
			</span>
			{hasShortcut ? <CommandShortcut>{display.text}</CommandShortcut> : null}
		</CommandItem>
	);
}
