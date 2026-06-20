import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@rox/ui/button";
import { Card, CardContent, CardHeader } from "@rox/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@rox/ui/form";
import { Input } from "@rox/ui/input";
import { toast } from "@rox/ui/sonner";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useSignOut } from "renderer/hooks/useSignOut";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import { z } from "zod";

export const Route = createFileRoute("/create-organization/")({
	component: CreateOrganization,
});

const formSchema = z.object({
	name: z.string().min(1, "Укажите название организации").max(100),
	slug: z
		.string()
		.min(3, "Slug должен содержать не менее 3 символов")
		.max(50)
		.regex(
			/^[a-z0-9-]+$/,
			"Slug может содержать только строчные латинские буквы, цифры и дефисы",
		)
		.regex(/^[a-z0-9]/, "Slug должен начинаться с буквы или цифры")
		.regex(/[a-z0-9]$/, "Slug должен заканчиваться буквой или цифрой"),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateOrganization() {
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const isSignedIn = !!session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const signOut = useSignOut();
	const navigate = useNavigate();

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isCheckingSlug, setIsCheckingSlug] = useState(false);
	const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			slug: "",
		},
	});

	const nameValue = form.watch("name");
	useEffect(() => {
		const slug = nameValue
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");

		if (slug && slug !== form.getValues("slug")) {
			form.setValue("slug", slug, { shouldValidate: false });
		}
	}, [nameValue, form]);

	const slugValue = form.watch("slug");
	useEffect(() => {
		const timer = setTimeout(async () => {
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
				logger.error("[create-org] Slug check failed:", error);
				setSlugAvailable(null);
			} finally {
				setIsCheckingSlug(false);
			}
		}, 500);

		return () => clearTimeout(timer);
	}, [slugValue]);

	async function handleSignOut(): Promise<void> {
		await signOut();
	}

	function renderSlugStatus(): ReactNode {
		if (isCheckingSlug) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
					Проверка...
				</span>
			);
		}
		if (slugAvailable === true) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600">
					Доступен
				</span>
			);
		}
		if (slugAvailable === false) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">
					Занят
				</span>
			);
		}
		return null;
	}

	async function onSubmit(values: FormValues): Promise<void> {
		setIsSubmitting(true);
		try {
			const organization = await apiTrpcClient.organization.create.mutate({
				name: values.name,
				slug: values.slug,
			});

			await authClient.organization.setActive({
				organizationId: organization.id,
			});

			// Refresh the cached session so the authenticated layout sees the new
			// activeOrganizationId before we navigate. Without this, useSession()
			// still holds a stale null activeOrganizationId and the layout bounces
			// the user straight back to /create-organization (see _authenticated
			// layout's `if (!activeOrganizationId)` redirect).
			await refetchSession();

			toast.success("Организация создана");
			navigate({ to: "/" });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Не удалось создать организацию",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!isSignedIn) {
		return <Navigate to="/sign-in" replace />;
	}

	const hasActiveOrganization = !!activeOrganizationId;

	return (
		<div className="relative flex min-h-screen items-center justify-center bg-background p-4">
			<div className="absolute top-4 right-4">
				{hasActiveOrganization ? (
					<Button
						variant="ghost"
						onClick={() => navigate({ to: "/" })}
						type="button"
					>
						Отмена
					</Button>
				) : (
					<Button variant="ghost" onClick={handleSignOut} type="button">
						Выйти
					</Button>
				)}
			</div>

			<Card className="w-full max-w-md">
				<CardHeader>
					<h1 className="text-2xl font-bold">Создать организацию</h1>
					<p className="text-sm text-muted-foreground">
						Запустите организацию, чтобы начать работу
					</p>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
							{/* Organization Name */}
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Название организации</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder="Acme Inc."
												disabled={isSubmitting}
											/>
										</FormControl>
										<FormDescription>
											Название вашей организации или команды
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="slug"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Slug</FormLabel>
										<FormControl>
											<div className="relative">
												<Input
													{...field}
													placeholder="acme-inc"
													disabled={isSubmitting}
												/>
												{renderSlugStatus()}
											</div>
										</FormControl>
										<FormDescription>
											Уникальный идентификатор организации (создается
											автоматически из названия)
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<Button
								type="submit"
								className="w-full"
								disabled={
									isSubmitting || isCheckingSlug || slugAvailable === false
								}
							>
								{isSubmitting ? "Создание..." : "Создать организацию"}
							</Button>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
