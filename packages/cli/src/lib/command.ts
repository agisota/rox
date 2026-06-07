import { createCommand } from "@rox/cli-framework";
import type { ApiClient } from "./api-client";
import type { RoxConfig } from "./config";
import type { AuthSource } from "./resolve-auth";

export interface CliContext {
	api: ApiClient;
	config: RoxConfig;
	bearer: string;
	authSource: AuthSource;
}

export const command = createCommand<CliContext>();
