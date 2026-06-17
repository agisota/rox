"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	AGENT_ROLES,
	COMMAND_SUGGESTIONS,
	DISPATCH_STEPS,
} from "../../../OrchestrationField/constants";

interface CommandConsoleProps {
	/** Called when a command is dispatched, so the parent can pulse the swarm. */
	onDispatch: () => void;
}

interface LogLine {
	id: number;
	glyph: string;
	role: string;
	color: string;
	text: string;
	task: string;
}

/**
 * Hero orchestration trigger. Visitors pick an example task; dispatching it
 * pulses the orchestration field and streams a short mock run of role-colored
 * agents into a log — the interactive payoff of the "orchestration" metaphor.
 */
export function CommandConsole({ onDispatch }: CommandConsoleProps) {
	const [log, setLog] = useState<LogLine[]>([]);
	const [running, setRunning] = useState(false);
	const idRef = useRef(0);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

	useEffect(
		() => () => {
			for (const timer of timers.current) clearTimeout(timer);
		},
		[],
	);

	const dispatch = useCallback(
		(raw: string) => {
			const task = raw.trim();
			if (!task || running) return;

			onDispatch();
			setRunning(true);
			setLog([]);
			for (const timer of timers.current) clearTimeout(timer);
			timers.current = [];

			DISPATCH_STEPS.forEach((step, index) => {
				const timer = setTimeout(
					() => {
						const role = AGENT_ROLES[step.role];
						if (!role) return;
						idRef.current += 1;
						setLog((prev) => [
							...prev,
							{
								id: idRef.current,
								glyph: role.glyph,
								role: role.label,
								color: role.color,
								text: step.text,
								task,
							},
						]);
						if (index === DISPATCH_STEPS.length - 1) setRunning(false);
					},
					450 + index * 700,
				);
				timers.current.push(timer);
			});
		},
		[onDispatch, running],
	);

	return (
		<div className="rox-cmd">
			<div className="rox-cmd__chips">
				{COMMAND_SUGGESTIONS.map((suggestion) => (
					<button
						key={suggestion}
						type="button"
						className="rox-cmd__chip"
						disabled={running}
						onClick={() => dispatch(suggestion)}
					>
						{suggestion}
					</button>
				))}
			</div>

			{log.length > 0 && (
				<ul className="rox-cmd__log" aria-live="polite">
					{log.map((line) => (
						<li key={line.id} className="rox-cmd__log-line">
							<span className="rox-cmd__log-role" style={{ color: line.color }}>
								{line.glyph} {line.role}
							</span>
							<span className="rox-cmd__log-text">{line.text}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
