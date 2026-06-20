"use client";

import { apiKeyClient } from "@better-auth/api-key/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import type { auth } from "@rox/auth/server";
import {
	customSessionClient,
	genericOAuthClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: process.env.NEXT_PUBLIC_API_URL,
	plugins: [
		organizationClient({
			teams: { enabled: true },
			schema: {
				team: {
					additionalFields: {
						slug: { type: "string", input: true, required: true },
					},
				},
			},
		}),
		customSessionClient<typeof auth>(),
		apiKeyClient(),
		oauthProviderClient(),
		// ROX-522: enables authClient.signIn.oauth2({ providerId: "yandex" }).
		genericOAuthClient(),
	],
});
