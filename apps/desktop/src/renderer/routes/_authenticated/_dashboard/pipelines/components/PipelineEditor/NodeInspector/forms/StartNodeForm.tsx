/**
 * Start node config. Exactly one start block is allowed and it cannot be deleted
 * (guarded in the shell). Renaming happens in the shell header, so the body is
 * just an explanatory helper.
 */
export function StartNodeForm() {
	return (
		<p className="text-[11px] text-muted-foreground">
			Стартовый узел — точка входа пайплайна. Он единственный и не может быть
			удалён. Переименуйте его в заголовке выше.
		</p>
	);
}
