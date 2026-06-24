import { Input } from "@rox/ui/input";
import { useEffect, useRef, useState } from "react";

interface InlineRenameProps {
	initial: string;
	onCommit: (name: string) => void;
	onCancel: () => void;
}

/**
 * Inline name editor for a row/tile. Double-click a name → this replaces it;
 * Enter commits (when changed + non-empty), Esc cancels, blur commits. Replaces
 * the web app's `window.prompt` rename. Selects the basename (sans extension)
 * on mount so renaming `report.pdf` lands the caret on `report`.
 */
export function InlineRename({
	initial,
	onCommit,
	onCancel,
}: InlineRenameProps) {
	const [value, setValue] = useState(initial);
	const ref = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		node.focus();
		const dot = initial.lastIndexOf(".");
		node.setSelectionRange(0, dot > 0 ? dot : initial.length);
	}, [initial]);

	const commit = () => {
		const next = value.trim();
		if (next.length === 0 || next === initial) {
			onCancel();
			return;
		}
		onCommit(next);
	};

	return (
		<Input
			ref={ref}
			value={value}
			onChange={(event) => setValue(event.target.value)}
			onClick={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Enter") {
					event.preventDefault();
					commit();
				} else if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				}
			}}
			onBlur={commit}
			className="h-7 px-1.5 py-0 text-sm"
		/>
	);
}
