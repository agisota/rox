#!/bin/bash
{{MARKER}}
# Gemini CLI lifecycle hook. JSON in via stdin; MUST print valid JSON to
# stdout before exit so gemini doesn't block on the hook.

INPUT=$(cat)

EVENT_TYPE=$(printf '%s' "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
HOOK_SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

case "$EVENT_TYPE" in
  BeforeAgent)              EVENT_TYPE="Start" ;;
  AfterAgent)               EVENT_TYPE="Stop"  ;;
  AfterTool)                EVENT_TYPE="Start" ;;
  SessionStart|SessionEnd)  ;;
  *)
    printf '{}\n'
    exit 0
    ;;
esac

printf '{}\n'

V1_EVENT_TYPE="$EVENT_TYPE"
case "$V1_EVENT_TYPE" in
  SessionStart) V1_EVENT_TYPE="Start" ;;
  SessionEnd)   V1_EVENT_TYPE="Stop" ;;
esac

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

if [ -n "$ROX_HOST_AGENT_HOOK_URL" ] && [ -n "$ROX_TERMINAL_ID" ]; then
  PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$ROX_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$ROX_AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"

  STATUS_CODE=$(curl -sX POST "$ROX_HOST_AGENT_HOOK_URL" \
    --connect-timeout 2 --max-time 5 \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    -o /dev/null -w "%{http_code}" 2>/dev/null)

  case "$STATUS_CODE" in
    2*) exit 0 ;;
    *) echo "[gemini-hook] host-service dispatch failed status=$STATUS_CODE; falling back to v1" >&2 ;;
  esac
fi

[ -z "$ROX_TAB_ID" ] && [ -z "$ROX_TERMINAL_ID" ] && exit 0

curl -sG "http://127.0.0.1:${ROX_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "paneId=$ROX_PANE_ID" \
  --data-urlencode "tabId=$ROX_TAB_ID" \
  --data-urlencode "workspaceId=$ROX_WORKSPACE_ID" \
  --data-urlencode "terminalId=$ROX_TERMINAL_ID" \
  --data-urlencode "sessionId=$HOOK_SESSION_ID" \
  --data-urlencode "hookSessionId=$HOOK_SESSION_ID" \
  --data-urlencode "eventType=$V1_EVENT_TYPE" \
  --data-urlencode "env=$ROX_ENV" \
  --data-urlencode "version=$ROX_HOOK_VERSION" \
  > /dev/null 2>&1

exit 0
