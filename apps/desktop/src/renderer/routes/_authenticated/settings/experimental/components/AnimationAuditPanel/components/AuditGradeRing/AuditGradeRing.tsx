import { AnimatedNumber, motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { motion } from "framer-motion";

export interface AuditGradeRingProps {
	score: number;
}

const SIZE = 120;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;

function scoreGrade(score: number): string {
	if (score >= 90) return "A";
	if (score >= 80) return "B";
	if (score >= 70) return "C";
	if (score >= 60) return "D";
	return "F";
}

function scoreColor(score: number): string {
	if (score >= 80) return "#10b981";
	if (score >= 60) return "#f59e0b";
	return "#ef4444";
}

export function AuditGradeRing({ score }: AuditGradeRingProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	const pathLength = score / 100;
	const grade = scoreGrade(score);
	const strokeColor = scoreColor(score);

	return (
		<div
			className="relative flex items-center justify-center shrink-0"
			style={{ width: SIZE, height: SIZE }}
		>
			<svg
				width={SIZE}
				height={SIZE}
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				style={{ transform: "rotate(-90deg)" }}
				aria-hidden
			>
				<title>{`Оценка аудита ${Math.round(score)} из 100, уровень ${grade}`}</title>
				{/* Track ring */}
				<circle
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={RADIUS}
					fill="none"
					strokeWidth={STROKE}
					className="stroke-muted/30"
				/>
				{/* Animated fill ring */}
				<motion.circle
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={RADIUS}
					fill="none"
					stroke={strokeColor}
					strokeWidth={STROKE}
					strokeLinecap="round"
					initial={shouldAnimate ? { pathLength: 0 } : false}
					animate={{ pathLength }}
					transition={shouldAnimate ? motionSpring.gentle : { duration: 0 }}
				/>
			</svg>
			{/* Center label — positioned over the rotated SVG */}
			<div className="absolute flex flex-col items-center leading-none">
				<AnimatedNumber
					value={score}
					className="text-2xl font-bold tabular-nums"
					format={(v) => Math.round(v).toString()}
				/>
				<span className="mt-0.5 text-xs font-medium text-muted-foreground">
					{grade}
				</span>
			</div>
		</div>
	);
}
