---
name: apple-reminders
description: Manage Apple Reminders via the `remindctl` CLI on macOS (list, add, edit, complete, delete). Supports lists, date filters, and JSON/plain output.
homepage: https://github.com/steipete/remindctl
metadata: {"clawdbot":{"emoji":"⏰","os":["darwin"],"requires":{"bins":["remindctl"]},"install":[{"id":"brew","kind":"brew","formula":"steipete/tap/remindctl","bins":["remindctl"],"label":"Install remindctl via Homebrew"}]}}
triggers:
  keywords: [reminders, remindctl, apple reminders, todo, task list, macos reminders]
  intent: [devops, orchestration]
activation: context
priority: 25
packs: []
---
