// The permission-mode preference store moved to a shared renderer location so
// BOTH chat panes (v2 + legacy) consume one persisted preference. Re-exported
// here to keep this surface's existing import path stable.
export { usePermissionModePreferenceStore } from "renderer/components/Chat/ChatInterface/hooks/usePermissionModePreference/store";
