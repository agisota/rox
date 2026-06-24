import { Button } from "@rox/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@rox/ui/drawer";
import { Input } from "@rox/ui/input";
import { ScrollArea } from "@rox/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { Textarea } from "@rox/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import { LuCopy, LuMessageSquarePlus } from "react-icons/lu";
import type { PromptEntry } from "../../lib/types";
import {
	initialVariableValues,
	parseVariables,
	renderPrompt,
} from "../../lib/variables";

export interface VariableFillTarget {
	prompt: PromptEntry;
	/** What happens when the user commits the filled body. */
	action: "insert" | "copy";
}

export interface VariableFillDrawerProps {
	target: VariableFillTarget | null;
	cachedValues: Record<string, string> | undefined;
	onOpenChange: (open: boolean) => void;
	onCommit: (
		target: VariableFillTarget,
		renderedText: string,
		values: Record<string, string>,
	) => void;
}

/**
 * Right-side fill sheet (vaul) auto-generating one labeled field per unique
 * `{{variable}}` with a live preview of the hydrated body. Commits the rendered
 * text via the chosen action (insert/copy). Mirrors the Harness modal pattern:
 * text / textarea / select inputs + preview + one-click commit.
 */
export function VariableFillDrawer({
	target,
	cachedValues,
	onOpenChange,
	onCommit,
}: VariableFillDrawerProps) {
	const variables = useMemo(
		() => (target ? parseVariables(target.prompt.body) : []),
		[target],
	);

	const [values, setValues] = useState<Record<string, string>>({});

	// Re-seed fields whenever a new prompt opens the drawer.
	useEffect(() => {
		if (!target) return;
		setValues(initialVariableValues(variables, cachedValues));
	}, [target, variables, cachedValues]);

	const preview = useMemo(() => {
		if (!target) return "";
		return renderPrompt(target.prompt.body, values).text;
	}, [target, values]);

	const setValue = (name: string, value: string) =>
		setValues((prev) => ({ ...prev, [name]: value }));

	const commit = () => {
		if (!target) return;
		onCommit(target, preview, values);
	};

	const actionLabel = target?.action === "copy" ? "Скопировать" : "Вставить";
	const ActionIcon = target?.action === "copy" ? LuCopy : LuMessageSquarePlus;

	return (
		<Drawer
			direction="right"
			open={target !== null}
			onOpenChange={onOpenChange}
		>
			<DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-md">
				<DrawerHeader>
					<DrawerTitle className="font-mono">
						{target?.prompt.title ?? "Заполнить переменные"}
					</DrawerTitle>
					<DrawerDescription>
						Заполните переменные — предпросмотр обновится сразу.
					</DrawerDescription>
				</DrawerHeader>

				<ScrollArea className="flex-1 px-4">
					<div className="flex flex-col gap-4 pb-4">
						{variables.map((variable) => (
							<div key={variable.name} className="flex flex-col gap-1.5">
								<label
									htmlFor={`var-${variable.name}`}
									className="font-mono text-xs text-muted-foreground"
								>
									{variable.label}
								</label>
								{variable.type === "select" ? (
									<Select
										value={values[variable.name] ?? ""}
										onValueChange={(value) => setValue(variable.name, value)}
									>
										<SelectTrigger id={`var-${variable.name}`}>
											<SelectValue placeholder="Выберите…" />
										</SelectTrigger>
										<SelectContent>
											{variable.options.map((option) => (
												<SelectItem key={option} value={option}>
													{option}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : variable.type === "long" ? (
									<Textarea
										id={`var-${variable.name}`}
										value={values[variable.name] ?? ""}
										onChange={(event) =>
											setValue(variable.name, event.target.value)
										}
										className="min-h-24 resize-y"
										placeholder={variable.defaultValue || variable.label}
									/>
								) : (
									<Input
										id={`var-${variable.name}`}
										value={values[variable.name] ?? ""}
										onChange={(event) =>
											setValue(variable.name, event.target.value)
										}
										placeholder={variable.defaultValue || variable.label}
									/>
								)}
							</div>
						))}

						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								Предпросмотр
							</span>
							<pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground select-text">
								{preview}
							</pre>
						</div>
					</div>
				</ScrollArea>

				<DrawerFooter className="flex-row justify-end gap-2">
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Отмена
					</Button>
					<Button onClick={commit}>
						<ActionIcon className="size-4" />
						{actionLabel}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
