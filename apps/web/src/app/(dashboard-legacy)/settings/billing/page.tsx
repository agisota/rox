import {
	DOWNLOAD_URL_MAC_ARM64,
	PROTOCOL_SCHEMES,
} from "@rox/shared/constants";
import { Button } from "@rox/ui/button";
import { Download, ExternalLink } from "lucide-react";
import { HiCheckCircle } from "react-icons/hi2";

export default async function BillingPage({
	searchParams,
}: {
	searchParams: Promise<{ success?: string }>;
}) {
	const { success } = await searchParams;
	const isSuccess = success === "true";

	if (isSuccess) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
				<HiCheckCircle className="h-12 w-12 text-green-500" />
				<h1 className="text-2xl font-semibold">Оплата прошла успешно</h1>
				<p className="text-muted-foreground">
					Ваша подписка активирована. Теперь вам доступны все возможности Pro.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
			<div>
				<h1 className="mb-2 text-2xl font-semibold">Оплата</h1>
				<p className="text-muted-foreground">
					Управляйте подпиской и оплатой в десктопном приложении.
				</p>
			</div>
			<div className="flex flex-wrap justify-center gap-3">
				<Button size="lg" className="gap-2" asChild>
					<a href={`${PROTOCOL_SCHEMES.PROD}://settings/billing`}>
						Открыть в десктопном приложении
						<ExternalLink className="size-4" />
					</a>
				</Button>
				<Button variant="outline" size="lg" className="gap-2" asChild>
					<a href={DOWNLOAD_URL_MAC_ARM64}>
						Скачать для Mac
						<Download className="size-4" />
					</a>
				</Button>
			</div>
		</div>
	);
}
