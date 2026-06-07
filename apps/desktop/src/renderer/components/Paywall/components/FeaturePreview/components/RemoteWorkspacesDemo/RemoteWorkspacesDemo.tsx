import { motion } from "framer-motion";
import { HiOutlineComputerDesktop, HiOutlineSignal } from "react-icons/hi2";
import { motionSpring, StatusPulse, useShouldAnimate } from "renderer/motion";

export function RemoteWorkspacesDemo() {
	const animate = useShouldAnimate("decorative");

	return (
		<div className="w-full h-full flex items-center justify-center">
			<div className="w-[300px] bg-card/90 backdrop-blur-sm rounded-lg border border-border shadow-2xl overflow-hidden">
				<div className="flex items-center justify-between px-4 py-3 bg-muted/80 border-b border-border/50">
					<div className="flex items-center gap-2">
						<div className="flex gap-1.5">
							<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
						</div>
						<span className="text-xs text-muted-foreground ml-1">
							Remote Workspaces
						</span>
					</div>
				</div>

				<div className="p-4">
					<div className="flex items-center justify-center gap-3 py-3">
						<div className="flex flex-col items-center gap-1.5">
							<div className="w-10 h-10 rounded-lg bg-foreground/10 flex items-center justify-center">
								<HiOutlineComputerDesktop className="size-5 text-foreground/80" />
							</div>
							<span className="text-[10px] text-muted-foreground">
								This Mac
							</span>
						</div>
						<div className="flex items-center gap-1">
							<div className="w-6 h-px bg-foreground/20" />
							{/* Connecting pulse — replaced Tailwind animate-pulse with framer-motion StatusPulse */}
							<StatusPulse active={true}>
								<HiOutlineSignal className="size-4 text-pink-400" />
							</StatusPulse>
							<div className="w-6 h-px bg-foreground/20" />
						</div>
						<div className="flex flex-col items-center gap-1.5">
							<div className="w-10 h-10 rounded-lg bg-foreground/10 flex items-center justify-center">
								<HiOutlineComputerDesktop className="size-5 text-foreground/80" />
							</div>
							<span className="text-[10px] text-muted-foreground">Remote</span>
						</div>
					</div>

					{/* Animated checklist — status rows stagger in on mount */}
					<div className="mt-2 space-y-1.5">
						<motion.div
							className="flex items-center justify-between px-2 py-1.5 rounded bg-foreground/5 text-xs"
							initial={animate ? { opacity: 0, y: 6 } : false}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0, ...motionSpring.soft }}
						>
							<span className="text-foreground/80">Tunnel established</span>
							{/* Connected check — spring-pops in after the row enters */}
							<motion.span
								className="text-emerald-400 text-[10px]"
								initial={animate ? { scale: 0.6, opacity: 0 } : false}
								animate={{ scale: 1, opacity: 1 }}
								transition={{ delay: 0.16, ...motionSpring.snappy }}
							>
								live
							</motion.span>
						</motion.div>
						<motion.div
							className="flex items-center justify-between px-2 py-1.5 rounded bg-foreground/5 text-xs"
							initial={animate ? { opacity: 0, y: 6 } : false}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.12, ...motionSpring.soft }}
						>
							<span className="text-foreground/80">Latency</span>
							<span className="text-foreground/60 text-[10px]">42ms</span>
						</motion.div>
					</div>
				</div>
			</div>
		</div>
	);
}
