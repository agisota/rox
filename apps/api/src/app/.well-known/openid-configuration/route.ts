import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@rox/auth/server";

export const GET = oauthProviderOpenIdConfigMetadata(auth);
