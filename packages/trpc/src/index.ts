// Root router and types
export type { AppRouter, RouterInputs, RouterOutputs } from "./root";
export { appRouter, createCaller } from "./root";

// Discriminated chat.complete result (consumed by the web/desktop quick chat).
export type { ChatCompleteOutput } from "./router/chat/chat";

// tRPC utilities
export {
	adminProcedure,
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "./trpc";
