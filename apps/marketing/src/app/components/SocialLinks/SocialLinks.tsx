"use client";

import { COMPANY } from "@rox/shared/constants";

interface SocialLinksProps {
	className?: string;
}

export function SocialLinks({ className = "" }: SocialLinksProps) {
	return (
		<div className={`flex items-center gap-2 ${className}`}>
			<a
				href={COMPANY.X_URL}
				target="_blank"
				rel="noopener noreferrer"
				className="text-muted-foreground hover:text-foreground transition-colors p-1 sm:p-2"
				aria-label="Мы в X/Twitter"
			>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="currentColor"
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>X/Twitter</title>
					<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
				</svg>
			</a>
		</div>
	);
}
