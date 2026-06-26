import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@rox/ui/resizable";
import type { ReactNode } from "react";

export interface MailShellProps {
	/** Always-visible top bar spanning the full width above the three panes. */
	header: ReactNode;
	rail: ReactNode;
	list: ReactNode;
	reader: ReactNode;
}

/**
 * Full-bleed mail layout: a fixed header row over a three-pane
 * (rail | list | reader) `react-resizable-panels` body. Replaces the old
 * `max-w`-capped SuiteScreen wrapper — the host renders this inside
 * `<DashboardSurface width="full" bare>` so it owns the entire window width and
 * height with no centered gutter.
 *
 * Panel sizing mirrors the spec: rail 200–240px (collapsible), list 300–420px,
 * reader takes the rest. Sizes are percentages (the library's unit) chosen to
 * land in those pixel bands at a typical desktop width, with min/max guards.
 */
export function MailShell({ header, rail, list, reader }: MailShellProps) {
	return (
		<div className="flex h-full min-h-0 w-full flex-col">
			{header}
			<ResizablePanelGroup
				direction="horizontal"
				autoSaveId="rox-mail-shell"
				className="min-h-0 w-full flex-1"
			>
				<ResizablePanel
					defaultSize={16}
					minSize={12}
					maxSize={22}
					collapsible
					collapsedSize={5}
					className="min-w-[3.5rem]"
				>
					{rail}
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel defaultSize={26} minSize={20} maxSize={38}>
					{list}
				</ResizablePanel>
				<ResizableHandle withHandle />
				<ResizablePanel defaultSize={58} minSize={30}>
					{reader}
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
