import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import {
	type MarkdownStyle,
	useMarkdownStyle,
	useSetMarkdownStyle,
} from "renderer/stores";

export function MarkdownStyleSection() {
	const markdownStyle = useMarkdownStyle();
	const setMarkdownStyle = useSetMarkdownStyle();

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">Стиль Markdown</h3>
			<p className="text-xs text-muted-foreground mb-3">
				Стиль отображения Markdown-файлов. Tufte использует элегантную
				типографику с засечками, вдохновленную книгами Edward Tufte.
			</p>
			<Select
				value={markdownStyle}
				onValueChange={(value) => setMarkdownStyle(value as MarkdownStyle)}
			>
				<SelectTrigger className="w-[200px]" aria-label="Стиль Markdown">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="default">По умолчанию</SelectItem>
					<SelectItem value="tufte">Tufte</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
