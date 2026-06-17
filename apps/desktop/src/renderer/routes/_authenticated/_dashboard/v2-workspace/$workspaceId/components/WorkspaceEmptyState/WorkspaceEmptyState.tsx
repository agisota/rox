import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import type { Variants } from "framer-motion";
import { motion } from "framer-motion";
import { useMemo } from "react";
import type { IconType } from "react-icons";
import { BsTerminalPlus } from "react-icons/bs";
import { LuSearch } from "react-icons/lu";
import { TbMessageCirclePlus, TbWorld } from "react-icons/tb";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { RoxLogo } from "renderer/routes/sign-in/components/RoxLogo";
import { EmptyTabActionButton } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/components/EmptyTabActionButton";

interface WorkspaceEmptyStateProps {
	onOpenBrowser: () => void;
	onOpenChat: () => void;
	onOpenQuickOpen: () => void;
	onOpenTerminal: () => void;
}

interface WorkspaceEmptyStateAction {
	display: string[];
	icon: IconType;
	id: string;
	label: string;
	onClick: () => void;
}

// One-shot, decorative entrance: the wordmark fades up first, then the four
// action rows stagger in. Reduced-motion users skip straight to the static
// layout via `initial={false}` (see `animate` gate below).
const containerVariants: Variants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const wordmarkVariants: Variants = {
	hidden: { opacity: 0, y: 6 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: motionDuration.base, ease: ease.standard },
	},
};

const actionVariants: Variants = {
	hidden: { opacity: 0, y: 8 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: motionDuration.base, ease: ease.standard },
	},
};

export function WorkspaceEmptyState({
	onOpenBrowser,
	onOpenChat,
	onOpenQuickOpen,
	onOpenTerminal,
}: WorkspaceEmptyStateProps) {
	// Essential: stagger entrance conveys structure; decorative: ambient float panels.
	const animate = useShouldAnimate("essential");
	const decorate = useShouldAnimate("decorative");
	const { keys: newGroupDisplay } = useHotkeyDisplay("NEW_GROUP");
	const { keys: newChatDisplay } = useHotkeyDisplay("NEW_CHAT");
	const { keys: newBrowserDisplay } = useHotkeyDisplay("NEW_BROWSER");
	const { keys: quickOpenDisplay } = useHotkeyDisplay("QUICK_OPEN");

	const actions = useMemo<Array<WorkspaceEmptyStateAction>>(
		() => [
			{
				id: "terminal",
				label: "Открыть терминал",
				display: newGroupDisplay,
				icon: BsTerminalPlus,
				onClick: onOpenTerminal,
			},
			{
				id: "chat",
				label: "Открыть чат",
				display: newChatDisplay,
				icon: TbMessageCirclePlus,
				onClick: onOpenChat,
			},
			{
				id: "browser",
				label: "Открыть браузер",
				display: newBrowserDisplay,
				icon: TbWorld,
				onClick: onOpenBrowser,
			},
			{
				id: "search-files",
				label: "Поиск файлов",
				display: quickOpenDisplay,
				icon: LuSearch,
				onClick: onOpenQuickOpen,
			},
		],
		[
			newBrowserDisplay,
			newChatDisplay,
			newGroupDisplay,
			onOpenBrowser,
			onOpenChat,
			onOpenQuickOpen,
			onOpenTerminal,
			quickOpenDisplay,
		],
	);

	return (
		<div className="relative flex h-full flex-1 items-center justify-center overflow-hidden px-6 py-10">
			{decorate && (
				<>
					<motion.div
						aria-hidden
						animate={{ y: [0, -6, 0] }}
						className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl"
						style={{ willChange: "transform" }}
						transition={{ duration: 7, ease: "easeInOut", repeat: Infinity }}
					/>
					<motion.div
						aria-hidden
						animate={{ y: [0, 6, 0] }}
						className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-accent/5 blur-3xl"
						style={{ willChange: "transform" }}
						transition={{
							delay: 1.5,
							duration: 9,
							ease: "easeInOut",
							repeat: Infinity,
						}}
					/>
				</>
			)}
			<motion.div
				animate="show"
				className="w-full max-w-xl"
				initial={animate ? "hidden" : false}
				variants={containerVariants}
			>
				<motion.div
					className="mb-7 flex items-center justify-center py-3"
					variants={wordmarkVariants}
				>
					<RoxLogo className="h-12 w-auto select-none opacity-90" />
				</motion.div>
				<div className="mx-auto grid w-full max-w-md gap-0.5">
					{actions.map((action) => (
						<motion.div key={action.id} variants={actionVariants}>
							<EmptyTabActionButton
								display={action.display}
								icon={action.icon}
								label={action.label}
								onClick={action.onClick}
							/>
						</motion.div>
					))}
				</div>
			</motion.div>
		</div>
	);
}
