# Codex's native notify callback only reports completion, so the wrapper uses
# Codex's process-scoped TUI session log for Start/permission events. Avoid
# tailing global rollout files: concurrent Codex sessions share that directory.
_rox_debug_enabled="0"
case "$ROX_DEBUG_HOOKS" in
  1|true|TRUE|True|yes|YES|on|ON) _rox_debug_enabled="1" ;;
esac
if [ "$_rox_debug_enabled" != "1" ] && { [ "$ROX_ENV" = "development" ] || [ "$NODE_ENV" = "development" ]; }; then
  _rox_debug_enabled="1"
fi

_rox_notify_path="{{NOTIFY_PATH}}"
_rox_debug_log="${ROX_HOOK_DEBUG_LOG:-/tmp/rox-codex-hooks.log}"
_rox_has_rox_context="0"
[ -n "$ROX_TERMINAL_ID$ROX_TAB_ID$ROX_PANE_ID" ] && _rox_has_rox_context="1"
ROX_CODEX_SESSION_WATCHER_PID=""
_rox_codex_args=()

_rox_debug() {
  [ "$_rox_debug_enabled" = "1" ] || return 0
  printf '%s [codex-wrapper] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)" "$*" >> "$_rox_debug_log" 2>/dev/null || true
}

_rox_toml_escape() {
  local _rox_value="$1"
  _rox_value="${_rox_value//\\/\\\\}"
  _rox_value="${_rox_value//\"/\\\"}"
  printf '%s' "$_rox_value"
}

_rox_configure_project_trust() {
  [ -n "${ROX_WORKSPACE_PATH:-}" ] || return 0

  local _rox_workspace_codex_home="$ROX_WORKSPACE_PATH/.codex"
  [ -f "$_rox_workspace_codex_home/config.toml" ] || return 0

  local _rox_workspace_path_toml
  _rox_workspace_path_toml="$(_rox_toml_escape "$ROX_WORKSPACE_PATH")"
  _rox_codex_args+=("-c" "projects={\"$_rox_workspace_path_toml\"={trust_level=\"trusted\"}}")
  _rox_debug "using trusted workspace Codex project config path=$ROX_WORKSPACE_PATH"
}

_rox_configure_project_trust

_rox_child_pids_for() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -P "$1" 2>/dev/null || true
    return 0
  fi
  ps -axo pid=,ppid= 2>/dev/null | awk -v ppid="$1" '$2 == ppid { print $1 }' 2>/dev/null || true
}

_rox_cleanup_session_watcher() {
  if [ -n "$ROX_CODEX_SESSION_WATCHER_PID" ]; then
    _rox_watcher_pid="$ROX_CODEX_SESSION_WATCHER_PID"
    _rox_child_pids="$(_rox_child_pids_for "$_rox_watcher_pid" | tr '\n' ' ')"
    for _rox_child_pid in $_rox_child_pids; do
      kill -TERM "$_rox_child_pid" >/dev/null 2>&1 || true
    done
    kill -TERM "$_rox_watcher_pid" >/dev/null 2>&1 || true
    sleep 0.2
    _rox_child_pids="$_rox_child_pids $(_rox_child_pids_for "$_rox_watcher_pid" | tr '\n' ' ')"
    for _rox_child_pid in $_rox_child_pids; do
      kill -KILL "$_rox_child_pid" >/dev/null 2>&1 || true
    done
    kill -KILL "$_rox_watcher_pid" >/dev/null 2>&1 || true
    _rox_debug "session watcher cleanup signaled pid=$_rox_watcher_pid"
    ROX_CODEX_SESSION_WATCHER_PID=""
  fi
}

_rox_exit_trap() {
  _rox_status=$?
  trap - EXIT HUP INT TERM
  _rox_cleanup_session_watcher
  exit "$_rox_status"
}

trap _rox_exit_trap EXIT HUP INT TERM

if [ "$_rox_has_rox_context" = "1" ] && [ -f "$_rox_notify_path" ]; then
  export CODEX_TUI_RECORD_SESSION="${CODEX_TUI_RECORD_SESSION:-1}"
  export CODEX_TUI_SESSION_LOG_PATH="${TMPDIR:-/tmp}/rox-codex-session-$$_$(date +%s).jsonl"
  _rox_debug "session watcher starting terminalId=$ROX_TERMINAL_ID tabId=$ROX_TAB_ID paneId=$ROX_PANE_ID log=$CODEX_TUI_SESSION_LOG_PATH notify=$_rox_notify_path"

  (
    _rox_notify="$_rox_notify_path"
    _rox_session_log="$CODEX_TUI_SESSION_LOG_PATH"

    _rox_emit_event() {
      _rox_payload=$(printf '{"hook_event_name":"%s"}' "$1")
      _rox_debug "emitting $1 via $_rox_notify"
      bash "$_rox_notify" "$_rox_payload" >/dev/null 2>&1 || true
    }

    _rox_i=0
    while [ ! -f "$_rox_session_log" ] && [ "$_rox_i" -lt 200 ]; do
      _rox_i=$((_rox_i + 1))
      sleep 0.1
    done
    if [ ! -f "$_rox_session_log" ]; then
      _rox_debug "session log not found path=$_rox_session_log"
      exit 0
    fi
    _rox_debug "watching session=$_rox_session_log"

    tail -n +1 -F "$_rox_session_log" 2>/dev/null | while IFS= read -r _rox_line; do
      case "$_rox_line" in
        *'"dir":"from_tui"'*'"kind":"op"'*'"UserTurn"'*) _rox_emit_event "Start" ;;
        *'_approval_request"'*) _rox_emit_event "PermissionRequest" ;;
      esac
    done
  ) 2>/dev/null &
  ROX_CODEX_SESSION_WATCHER_PID=$!
  _rox_debug "session watcher pid=$ROX_CODEX_SESSION_WATCHER_PID"
else
  _rox_notify_exists="0"
  [ -f "$_rox_notify_path" ] && _rox_notify_exists="1"
  _rox_debug "session watcher disabled hasRoxContext=$_rox_has_rox_context terminalId=$ROX_TERMINAL_ID tabId=$ROX_TAB_ID paneId=$ROX_PANE_ID notifyExists=$_rox_notify_exists notify=$_rox_notify_path"
fi

# `hooks` (formerly `codex_hooks`) is stable and default-enabled in codex
# >=0.129; the legacy `notify=...` callback remains the completion source.
"$REAL_BIN" "${_rox_codex_args[@]}" --enable hooks -c 'notify=["bash","{{NOTIFY_PATH}}"]' "$@"
ROX_CODEX_STATUS=$?
_rox_debug "codex exited status=$ROX_CODEX_STATUS"

_rox_cleanup_session_watcher

trap - EXIT HUP INT TERM
exit "$ROX_CODEX_STATUS"
