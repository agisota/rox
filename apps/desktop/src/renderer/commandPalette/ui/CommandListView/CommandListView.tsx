import { CommandEmpty, CommandGroup, CommandList } from "@rox/ui/command";
import { motion } from "framer-motion";
import { ease, motionDuration, useShouldAnimate } from "renderer/motion";
import { useCommandContext } from "../../core/ContextProvider";
import type { Command } from "../../core/types";
import { useActiveCommands } from "../../core/useActiveCommands";
import { CommandItemRow } from "../CommandItemRow/CommandItemRow";

interface CommandListViewProps {
	onSelect: (command: Command) => void;
}

export function CommandListView({ onSelect }: CommandListViewProps) {
	const context = useCommandContext();
	const sections = useActiveCommands(context);
	// Decorative tier: a restrained one-shot fade/slide-up of the result list
	// when the palette opens. Plays once on mount (= on open) and stays settled
	// through filtering — the rows themselves stay plain cmdk items so keyboard
	// nav, `data-selected` scroll tracking and filtering are untouched. Reduced
	// motion → `initial={false}`, instant.
	const animate = useShouldAnimate("decorative");

	return (
		<CommandList>
			<CommandEmpty>No commands found.</CommandEmpty>
			<motion.div
				initial={animate ? { opacity: 0, y: 6 } : false}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: motionDuration.base, ease: ease.standard }}
			>
				{sections.map((section) => (
					<CommandGroup key={section.id} heading={section.label}>
						{section.commands.map((command) => (
							<CommandItemRow
								key={command.id}
								command={command}
								onSelect={onSelect}
							/>
						))}
					</CommandGroup>
				))}
			</motion.div>
		</CommandList>
	);
}
