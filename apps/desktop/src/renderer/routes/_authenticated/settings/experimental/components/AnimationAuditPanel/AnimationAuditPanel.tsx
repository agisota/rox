import { useMemo } from "react";
import { MotionList } from "renderer/motion";
import {
	AuditFindingRow,
	type Finding,
} from "./components/AuditFindingRow/AuditFindingRow";
import { AuditGradeRing } from "./components/AuditGradeRing/AuditGradeRing";

const SYNTHETIC_FINDINGS: Finding[] = [
	{
		id: "reduced-motion",
		label: "Гейт reduced motion есть во всех примитивах",
		status: "pass",
		costMs: 0.1,
	},
	{
		id: "no-layout-on-dnd",
		label: "У сортируемых DnD-узлов нет prop layout",
		status: "pass",
		costMs: 0.2,
	},
	{
		id: "no-xterm-animate",
		label: "Строки xterm / CodeMirror не анимируются",
		status: "pass",
		costMs: 0.1,
	},
	{
		id: "transform-only",
		label: "Анимируются только transform и opacity",
		status: "pass",
		costMs: 0.3,
	},
	{
		id: "will-change",
		label: "will-change: transform на активных motion-слоях",
		status: "warn",
		costMs: 1.2,
	},
	{
		id: "stagger-cap",
		label: "Stagger-список ограничен 20 элементами",
		status: "warn",
		costMs: 0.8,
	},
	{
		id: "spring-damping",
		label: "Spring-пресеты в безопасных пределах damping",
		status: "pass",
		costMs: 0.1,
	},
];

function computeScore(findings: Finding[]): number {
	const total = findings.length;
	if (total === 0) return 100;
	const passes = findings.filter((f) => f.status === "pass").length;
	const warns = findings.filter((f) => f.status === "warn").length;
	return Math.round(((passes + warns * 0.5) / total) * 100);
}

export function AnimationAuditPanel() {
	const findings = useMemo(() => SYNTHETIC_FINDINGS, []);
	const score = useMemo(() => computeScore(findings), [findings]);

	return (
		<div className="space-y-6 rounded-lg border p-4">
			<div>
				<h3 className="text-base font-semibold">Аудит анимаций</h3>
				<p className="mt-1 text-sm text-muted-foreground">
					Внутренний инструмент разработки — не виден в production-сборках.
				</p>
			</div>
			<div className="flex items-start gap-8">
				<AuditGradeRing score={score} />
				<div className="min-w-0 flex-1">
					<MotionList className="space-y-2">
						{findings.map((finding) => (
							<AuditFindingRow key={finding.id} finding={finding} />
						))}
					</MotionList>
				</div>
			</div>
		</div>
	);
}
