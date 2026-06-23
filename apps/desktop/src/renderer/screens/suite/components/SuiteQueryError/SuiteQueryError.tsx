import { Button } from "@rox/ui/button";

export interface SuiteQueryErrorProps {
	message: string;
	onRetry: () => void;
}

/**
 * Inline error card for a failed Workspace Suite query. Mirrors the pipelines
 * index error idiom: the message is `select-text cursor-text` (the renderer
 * disables text selection on `body`, so error text must opt back in for bug
 * reports) and a retry button re-runs the query.
 */
export function SuiteQueryError({ message, onRetry }: SuiteQueryErrorProps) {
	return (
		<div className="rounded-lg border border-destructive/40 p-6 text-center">
			<p className="cursor-text select-text text-destructive text-sm">
				{message}
			</p>
			<Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
				Повторить
			</Button>
		</div>
	);
}
