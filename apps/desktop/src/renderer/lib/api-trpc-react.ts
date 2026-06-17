import type { AppRouter } from "@rox/trpc";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { apiTrpcClient } from "./api-trpc-client";

/**
 * Cloud tRPC React-Query options proxy.
 *
 * The renderer reaches cloud (Neon) data over HTTP via {@link apiTrpcClient}
 * (a vanilla `createTRPCProxyClient` — i.e. a `TRPCClient<AppRouter>` — with
 * bearer-token auth). That client only exposes the imperative `.query()` /
 * `.mutate()` surface, so components ported from the web feature (which call
 * the `@trpc/tanstack-react-query` proxy API: `.queryOptions` /
 * `.mutationOptions` / `.queryKey`) cannot import it directly.
 *
 * This proxy adapts the existing cloud transport to that same options-builder
 * shape, backed by the app-wide {@link electronQueryClient}. No new Provider or
 * transport is needed — `apiTrpcClient` is standalone and `electronQueryClient`
 * already wraps the renderer.
 *
 * Use it for cloud routers that are NOT synced via Electric (e.g. the agent
 * `pipeline` / `agentRole` / `pipelineTrigger` config). Electric-backed
 * collections still go through `useCollections()` + `useLiveQuery`, and
 * desktop-local IPC concerns still go through `electronTrpc`.
 */
export const cloudTrpc = createTRPCOptionsProxy<AppRouter>({
	client: apiTrpcClient,
	queryClient: electronQueryClient,
});

/**
 * Hook alias mirroring the web feature's `useTRPC()` from `@/trpc/react`, so
 * ported components can keep `const trpc = useTRPC()` with identical downstream
 * `.queryOptions` / `.mutationOptions` / `.queryKey` calls. The proxy is a
 * module-level singleton, so this is a stable reference (no Provider lookup).
 */
export const useCloudTrpc = () => cloudTrpc;
