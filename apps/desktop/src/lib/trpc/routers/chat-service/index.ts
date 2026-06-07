import {
	createChatServiceRouter as buildRouter,
	ChatService,
} from "@rox/chat/server/desktop";

export const chatService = new ChatService();

export const createChatServiceRouter = () => buildRouter(chatService);

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
