import {
	Archive,
	FileText,
	Inbox,
	Mail,
	MailOpen,
	Paperclip,
	Send,
	ShieldAlert,
	Star,
	Trash2,
} from "lucide-react";
import type { ComponentType } from "react";
import type { MailFolderDef, MailFolderId } from "./mailTypes";

/** Lucide icon for each folder/filter, kept out of the data file. */
export const MAIL_FOLDER_ICONS: Record<
	MailFolderId,
	ComponentType<{ className?: string }>
> = {
	inbox: Inbox,
	sent: Send,
	drafts: FileText,
	archive: Archive,
	spam: ShieldAlert,
	trash: Trash2,
	unread: MailOpen,
	attachments: Paperclip,
	flagged: Star,
};

/** Empty-state copy per folder (RU), shown when the folder feed is empty. */
export const MAIL_FOLDER_EMPTY: Record<
	MailFolderId,
	{ title: string; hint: string }
> = {
	inbox: {
		title: "Входящих нет",
		hint: "Когда придут письма, они появятся здесь.",
	},
	sent: {
		title: "Отправленных нет",
		hint: "Письма, которые вы отправите, появятся здесь.",
	},
	drafts: {
		title: "Черновиков нет",
		hint: "Сохранённые черновики появятся здесь.",
	},
	archive: {
		title: "Архив пуст",
		hint: "Заархивированные письма появятся здесь.",
	},
	spam: { title: "Спама нет", hint: "Подозрительные письма попадают сюда." },
	trash: {
		title: "Корзина пуста",
		hint: "Удалённые письма хранятся здесь до очистки.",
	},
	unread: { title: "Непрочитанных нет", hint: "Вы прочитали все письма." },
	attachments: {
		title: "Писем с вложениями нет",
		hint: "Письма с файлами появятся здесь.",
	},
	flagged: {
		title: "Помеченных нет",
		hint: "Отметьте письмо, чтобы вернуться к нему позже.",
	},
};

/**
 * System folders + smart filters of the left rail, in display order. Only
 * `inbox` is server-backed in P0; the rest are honest navigation targets that
 * surface their empty copy until the server exposes folder/flag columns.
 */
export const MAIL_FOLDERS: readonly MailFolderDef[] = [
	{ id: "inbox", label: "Входящие", kind: "folder", serverBacked: true },
	{ id: "sent", label: "Отправленные", kind: "folder", serverBacked: false },
	{ id: "drafts", label: "Черновики", kind: "folder", serverBacked: false },
	{ id: "archive", label: "Архив", kind: "folder", serverBacked: false },
	{ id: "spam", label: "Спам", kind: "folder", serverBacked: false },
	{ id: "trash", label: "Корзина", kind: "folder", serverBacked: false },
	{ id: "unread", label: "Непрочитанные", kind: "filter", serverBacked: false },
	{
		id: "attachments",
		label: "С вложениями",
		kind: "filter",
		serverBacked: false,
	},
	{ id: "flagged", label: "Помеченные", kind: "filter", serverBacked: false },
] as const;

/** Fallback icon when an id is missing (defensive, never hit at runtime). */
export const MAIL_FALLBACK_ICON = Mail;
