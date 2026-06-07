import type { UseChatDisplayReturn } from "@rox/chat/client";

export type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

export type ChatMessagePart = ChatMessage["content"][number];
