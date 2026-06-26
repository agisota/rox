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
 * System folders + smart filters of the left rail, in display order. All but
 * `sent` are server-backed (FN-135/139, #697/#699): folder placement + ⭐ flag +
 * unread count + has-attachments live on the thread row, and drafts come from
 * `mail.listDrafts`. `sent` awaits a dedicated outbound-direction feed.
 */
export const MAIL_FOLDERS: readonly MailFolderDef[] = [
	{ id: "inbox", label: "Входящие", kind: "folder", serverBacked: true },
	{ id: "sent", label: "Отправленные", kind: "folder", serverBacked: false },
	{ id: "drafts", label: "Черновики", kind: "folder", serverBacked: true },
	{ id: "archive", label: "Архив", kind: "folder", serverBacked: true },
	{ id: "spam", label: "Спам", kind: "folder", serverBacked: true },
	{ id: "trash", label: "Корзина", kind: "folder", serverBacked: true },
	{ id: "unread", label: "Непрочитанные", kind: "filter", serverBacked: true },
	{
		id: "attachments",
		label: "С вложениями",
		kind: "filter",
		serverBacked: true,
	},
	{ id: "flagged", label: "Помеченные", kind: "filter", serverBacked: true },
] as const;

/** Fallback icon when an id is missing (defensive, never hit at runtime). */
export const MAIL_FALLBACK_ICON = Mail;
