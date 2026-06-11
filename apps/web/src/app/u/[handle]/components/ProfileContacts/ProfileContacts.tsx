import { Button } from "@rox/ui/button";
import { AtSign, Mail, MessageCircle, Send } from "lucide-react";

type ContactLink = {
	label: string;
	href: string;
	icon: "email" | "telegram" | "message" | "social";
};

type ProfileContactsProps = {
	contacts: ContactLink[];
};

const contactIcons = {
	email: Mail,
	telegram: Send,
	message: MessageCircle,
	social: AtSign,
};

export function ProfileContacts({ contacts }: ProfileContactsProps) {
	if (contacts.length === 0) {
		return null;
	}

	return (
		<nav className="flex flex-wrap gap-2" aria-label="Контакты профиля">
			{contacts.map((contact) => {
				const Icon = contactIcons[contact.icon];

				return (
					<Button key={contact.label} variant="secondary" size="sm" asChild>
						<a href={contact.href} target="_blank" rel="noopener noreferrer">
							<Icon className="size-4" />
							{contact.label}
						</a>
					</Button>
				);
			})}
		</nav>
	);
}

export type { ContactLink };
