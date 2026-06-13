"use server";

import { ContactInquiryEmail } from "@rox/email/emails/contact-inquiry";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "@/env";
import { checkEmailFormRateLimit } from "@/lib/email-rate-limit";
import {
	sanitizeMessage,
	sanitizeSingleLine,
	validateEmail,
} from "@/lib/form-utils";

const resend = new Resend(env.RESEND_API_KEY);

const contactFormDataSchema = z.object({
	name: z.string(),
	email: z.string(),
	topic: z.string().optional().default(""),
	message: z.string(),
	honeypot: z.string().optional(),
});

export async function submitContactInquiry(data: unknown) {
	const parsedData = contactFormDataSchema.safeParse(data);
	if (!parsedData.success) {
		return { success: false, error: "Проверьте введённые данные." };
	}

	const { name, email, topic, message, honeypot } = parsedData.data;

	if (honeypot && honeypot.length > 0) {
		return {
			success: false,
			error: "Что-то пошло не так. Попробуйте ещё раз.",
		};
	}

	if (!name || !email || !message) {
		return { success: false, error: "Заполните обязательные поля." };
	}

	const sanitizedName = sanitizeSingleLine(name);
	const sanitizedEmail = sanitizeSingleLine(email);
	const sanitizedTopic = sanitizeSingleLine(topic) || "Общий вопрос";
	const sanitizedMessage = sanitizeMessage(message);

	if (!sanitizedName || !sanitizedEmail || !sanitizedMessage) {
		return { success: false, error: "Проверьте введённые данные." };
	}

	if (!validateEmail(sanitizedEmail)) {
		return { success: false, error: "Введите корректный email." };
	}

	try {
		if (!(await checkEmailFormRateLimit(sanitizedEmail))) {
			return {
				success: false,
				error: "Слишком много сообщений. Попробуйте позже.",
			};
		}

		const { error } = await resend.emails.send({
			from: "Rox <noreply@rox.one>",
			to: "founders@rox.one",
			replyTo: sanitizedEmail,
			subject: `Contact message from ${sanitizedName}: ${sanitizedTopic}`,
			react: ContactInquiryEmail({
				name: sanitizedName,
				email: sanitizedEmail,
				topic: sanitizedTopic,
				message: sanitizedMessage,
			}),
		});

		if (error) {
			console.error("Failed to send contact inquiry email:", error);
			return {
				success: false,
				error: "Что-то пошло не так. Попробуйте ещё раз.",
			};
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to send contact inquiry email:", error);
		return {
			success: false,
			error: "Что-то пошло не так. Попробуйте ещё раз.",
		};
	}
}
