import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

/**
 * Format an ISO `updatedAt` timestamp into a short RU relative string
 * ("обновлён 3 ч назад"). Returns `null` for missing/invalid input so the row
 * can simply omit the chip instead of rendering "Invalid Date".
 */
export function formatRelativeUpdatedAt(
	updatedAt: string | null,
): string | null {
	if (!updatedAt) return null;
	const date = new Date(updatedAt);
	if (Number.isNaN(date.getTime())) return null;
	return `обновлён ${formatDistanceToNow(date, { addSuffix: true, locale: ru })}`;
}
