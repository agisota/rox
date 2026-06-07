import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

interface TabRenameInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
	className?: string;
	maxLength?: number;
	/**
	 * When true, render the input as a `motion.input` with a focus-ring scale
	 * pop on enter (case 040). When false/undefined, render the plain `<input>`
	 * unchanged so reduced-motion is honored. motion.input forwards refs and
	 * native input props, so every handler/ref below is preserved verbatim.
	 */
	animate?: boolean;
}

export function TabRenameInput({
	value,
	onChange,
	onSubmit,
	onCancel,
	className,
	maxLength,
	animate,
}: TabRenameInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, []);

	// Shared native props/handlers — identical for both render paths.
	const inputProps = {
		ref: inputRef,
		className,
		maxLength,
		onBlur: onSubmit,
		onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
			onChange(event.target.value),
		onClick: (event: React.MouseEvent<HTMLInputElement>) =>
			event.stopPropagation(),
		onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
			event.stopPropagation();
			if (event.key === "Enter") {
				event.preventDefault();
				onSubmit();
			} else if (event.key === "Escape") {
				event.preventDefault();
				onCancel();
			}
		},
		onMouseDown: (event: React.MouseEvent<HTMLInputElement>) =>
			event.stopPropagation(),
		type: "text" as const,
		value,
	};

	if (animate) {
		return (
			<motion.input
				{...inputProps}
				animate={{ opacity: 1, scale: 1 }}
				initial={{ opacity: 0, scale: 0.96 }}
				transition={{ type: "spring", stiffness: 500, damping: 30 }}
			/>
		);
	}

	return <input {...inputProps} />;
}
