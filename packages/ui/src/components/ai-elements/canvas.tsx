import { Background, ReactFlow, type ReactFlowProps } from "@xyflow/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import "@xyflow/react/dist/style.css";

type CanvasProps = ReactFlowProps & {
	children?: ReactNode;
};

export const Canvas = ({ children, className, ...props }: CanvasProps) => (
	<ReactFlow
		className={cn("h-full w-full", className)}
		deleteKeyCode={["Backspace", "Delete"]}
		fitView
		panOnDrag={false}
		panOnScroll
		selectionOnDrag={true}
		zoomOnDoubleClick={false}
		{...props}
	>
		<Background bgColor="var(--sidebar)" />
		{children}
	</ReactFlow>
);
