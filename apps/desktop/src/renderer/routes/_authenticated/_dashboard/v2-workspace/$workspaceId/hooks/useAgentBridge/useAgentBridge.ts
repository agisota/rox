import {
	createUiCommandAckEnvelope,
	parseUiCommandEnvelope,
	type UiCommandResult,
} from "@rox/agent-bridge/commands";
import {
	buildContextPacket,
	createContextEnvelope,
} from "@rox/agent-bridge/context";
import { useEventBus, workspaceTrpc } from "@rox/workspace-client";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";
import { logger } from "renderer/lib/logger";

const SELECTION_DEBOUNCE_MS = 300;

/**
 * Agent-aware bridge, renderer side.
 *
 * Publishes a whitelisted "context packet" (route + workspace id + selected
 * text) to the host-service whenever the screen changes, and executes
 * allow-listed UI commands (`navigate`) requested by agents through the
 * `agentBridge` MCP tools, acking each command back to the host.
 */
export function useAgentBridge({ workspaceId }: { workspaceId: string }) {
	const router = useRouter();
	const eventBus = useEventBus();
	const publishContext = workspaceTrpc.agentBridge.publishContext.useMutation();
	const ackUiCommand = workspaceTrpc.agentBridge.ackUiCommand.useMutation();

	const publish = useEffectEvent(() => {
		const packet = buildContextPacket({
			workspaceId,
			route: { pathname: router.state.location.pathname },
			selectionText: window.getSelection()?.toString() ?? null,
		});
		publishContext.mutate(
			{ envelope: createContextEnvelope(packet) },
			{
				onError: (error) => {
					logger.warn("[agent-bridge] failed to publish context:", error);
				},
			},
		);
	});

	useEffect(() => {
		publish();
		const unsubscribeRouter = router.subscribe("onResolved", publish);

		let debounce: ReturnType<typeof setTimeout> | undefined;
		const onSelectionChange = () => {
			clearTimeout(debounce);
			debounce = setTimeout(publish, SELECTION_DEBOUNCE_MS);
		};
		document.addEventListener("selectionchange", onSelectionChange);

		return () => {
			unsubscribeRouter();
			document.removeEventListener("selectionchange", onSelectionChange);
			clearTimeout(debounce);
		};
	}, [router]);

	const handleCommandEnvelope = useEffectEvent((envelope: unknown) => {
		const parsed = parseUiCommandEnvelope(envelope);
		if (!parsed.ok) {
			logger.warn("[agent-bridge] dropping invalid ui command:", parsed.error);
			return;
		}
		const ack = (result: UiCommandResult) => {
			ackUiCommand.mutate(
				{ envelope: createUiCommandAckEnvelope(parsed.requestId, result) },
				{
					onError: (error) => {
						logger.warn("[agent-bridge] failed to ack ui command:", error);
					},
				},
			);
		};

		switch (parsed.command.kind) {
			case "navigate": {
				router
					.navigate({ to: parsed.command.route })
					.then(() => ack({ ok: true }))
					.catch((error: unknown) =>
						ack({
							ok: false,
							error: error instanceof Error ? error.message : String(error),
						}),
					);
				break;
			}
		}
	});

	useEffect(() => {
		return eventBus.on(
			"agent-bridge:ui-command",
			workspaceId,
			(_workspaceId, payload) => {
				handleCommandEnvelope(payload.envelope);
			},
		);
	}, [eventBus, workspaceId]);
}
