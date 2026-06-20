import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormLabel,
	FormMessage,
} from "@rox/ui/form";
import { Input } from "@rox/ui/input";
import { toast } from "@rox/ui/sonner";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import { z } from "zod";

const slugSchema = z.object({
	slug: z
		.string()
		.min(3, "Slug должен быть не короче 3 символов")
		.max(50, "Slug должен быть не длиннее 50 символов")
		.regex(
			/^[a-z0-9-]+$/,
			"Slug может содержать только строчные латинские буквы, цифры и дефисы",
		)
		.regex(/^[a-z0-9]/, "Slug должен начинаться с буквы или цифры")
		.regex(/[a-z0-9]$/, "Slug должен заканчиваться буквой или цифрой"),
});

type SlugFormValues = z.infer<typeof slugSchema>;

interface SlugDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	currentSlug: string;
	onSuccess?: () => void;
}

export function SlugDialog({
	open,
	onOpenChange,
	organizationId,
	currentSlug,
	onSuccess,
}: SlugDialogProps) {
	const [isCheckingSlug, setIsCheckingSlug] = useState(false);
	const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

	const slugForm = useForm<SlugFormValues>({
		resolver: zodResolver(slugSchema),
		defaultValues: {
			slug: currentSlug,
		},
	});

	const slugValue = slugForm.watch("slug");

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only sync on currentSlug change
	useEffect(() => {
		slugForm.reset({ slug: currentSlug });
	}, [currentSlug]);

	useEffect(() => {
		if (!open) return;

		const timer = setTimeout(async () => {
			if (slugValue === currentSlug) {
				setSlugAvailable(null);
				return;
			}

			if (!slugValue || slugValue.length < 3) {
				setSlugAvailable(null);
				return;
			}

			setIsCheckingSlug(true);
			try {
				const result = await authClient.organization.checkSlug({
					slug: slugValue,
				});

				setSlugAvailable(result.data?.status ?? null);
			} catch (error) {
				logger.error("[slug-dialog] Slug check failed:", error);
				setSlugAvailable(null);
			} finally {
				setIsCheckingSlug(false);
			}
		}, 500);

		return () => clearTimeout(timer);
	}, [slugValue, currentSlug, open]);

	async function handleSlugUpdate(values: SlugFormValues): Promise<void> {
		try {
			await apiTrpcClient.organization.update.mutate({
				id: organizationId,
				slug: values.slug,
			});
			onSuccess?.();
			onOpenChange(false);
			setSlugAvailable(null);
			toast.success("URL организации обновлен!");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Не удалось обновить URL";
			toast.error(message);
		}
	}

	function getSlugStatusDisplay(): { text: string; className: string } | null {
		if (isCheckingSlug) {
			return { text: "Проверка...", className: "text-muted-foreground" };
		}
		if (slugAvailable === true) {
			return { text: "Свободен", className: "text-green-600" };
		}
		if (slugAvailable === false) {
			return { text: "Занят", className: "text-destructive" };
		}
		return null;
	}

	const slugStatus = getSlugStatusDisplay();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Изменить slug организации</DialogTitle>
					<DialogDescription>
						Это изменит публичный URL вашей организации. Не забудьте обновить
						закладки и ссылки, которыми вы уже поделились.
					</DialogDescription>
				</DialogHeader>
				<Form {...slugForm}>
					<form
						onSubmit={slugForm.handleSubmit(handleSlugUpdate)}
						className="space-y-4"
					>
						<FormField
							control={slugForm.control}
							name="slug"
							render={({ field }) => (
								<>
									<FormLabel>Slug организации</FormLabel>
									<FormControl>
										<div className="relative">
											<Input {...field} placeholder="acme-inc" />
											{slugStatus && (
												<span
													className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${slugStatus.className}`}
												>
													{slugStatus.text}
												</span>
											)}
										</div>
									</FormControl>
									<FormMessage />
								</>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									onOpenChange(false);
									slugForm.reset({ slug: currentSlug });
									setSlugAvailable(null);
								}}
							>
								Отмена
							</Button>
							<Button
								type="submit"
								disabled={
									isCheckingSlug ||
									slugAvailable === false ||
									slugValue === currentSlug
								}
							>
								Сохранить
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
