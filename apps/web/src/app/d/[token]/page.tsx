import { ShareLanding } from "./components/ShareLanding";

export const metadata = {
	title: "Общий доступ — Rox",
};

/**
 * Public Drive share landing: `rox.one/d/<token>`. No auth required — the page
 * resolves the share via the public `drive.resolveShare` procedure and streams
 * the download (or prompts for a password). Folder shares show metadata only
 * (P0). `params` is awaited per Next.js 16's async dynamic APIs.
 */
export default async function SharePage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;

	return (
		<div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
			<ShareLanding token={token} />
		</div>
	);
}
