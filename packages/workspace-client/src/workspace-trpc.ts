import type { AppRouter } from "@rox/host-service/trpc";
import { createTRPCReact } from "@trpc/react-query";

export const workspaceTrpc = createTRPCReact<AppRouter>({
	abortOnUnmount: true,
});
