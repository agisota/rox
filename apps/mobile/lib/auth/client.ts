import { expoClient } from "@better-auth/expo/client";
import type { auth } from "@rox/auth/server";
import {
	customSessionClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { env } from "../env";

export const authClient = createAuthClient({
	baseURL: env.EXPO_PUBLIC_API_URL,
	plugins: [
		expoClient({
			scheme: "rox",
			storagePrefix: "rox",
			storage: SecureStore,
		}),
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
	],
});

export const { signIn, signOut, signUp, useSession } = authClient;
