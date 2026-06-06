"use client";

import * as Sentry from "@sentry/nextjs";
import { DEFAULT_HTML_LANG } from "@superset/shared/constants";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
	error,
}: {
	error: Error & { digest?: string };
}) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<html lang={DEFAULT_HTML_LANG}>
			<body>
				<NextError statusCode={0} />
			</body>
		</html>
	);
}
