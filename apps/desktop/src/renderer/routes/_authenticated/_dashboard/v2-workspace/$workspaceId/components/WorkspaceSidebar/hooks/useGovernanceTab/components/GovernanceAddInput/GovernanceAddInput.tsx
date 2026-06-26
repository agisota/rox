import { Input } from "@rox/ui/input";
import { cn } from "@rox/ui/utils";
import { useEffect, useRef, useState } from "react";

interface GovernanceAddInputProps {
	placeholder: string;
	onSubmit: (text: string) => void;
	onCancel: () => void;
	className?: string;
}

/**
 * Inline single-line add field for a governance section. Enter commits (and
 * keeps the field open for rapid entry), Escape / blur-while-empty cancels.
 * Auto-focuses on mount.
 */
export function GovernanceAddInput({
	placeholder,
	onSubmit,
	onCancel,
	className,
}: GovernanceAddInputProps) {
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	function commit() {
		const trimmed = value.trim();
		if (!trimmed) {
			onCancel();
			return;
		}
		onSubmit(trimmed);
		setValue("");
		// Keep focus for rapid sequential entry.
		requestAnimationFrame(() => inputRef.current?.focus());
	}

	return (
		<div className={cn("px-2 py-1", className)}>
			<Input
				ref={inputRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder={placeholder}
				className={cn(
					"h-7 rounded-md border-border/60 bg-card/40 px-2 font-mono text-xs",
					"placeholder:text-muted-foreground/60 backdrop-blur-sm",
					"focus-visible:border-ring/60 focus-visible:ring-ring/30 focus-visible:ring-2",
				)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						commit();
					} else if (e.key === "Escape") {
						e.preventDefault();
						setValue("");
						onCancel();
					}
				}}
				onBlur={() => {
					if (!value.trim()) onCancel();
				}}
			/>
		</div>
	);
}
