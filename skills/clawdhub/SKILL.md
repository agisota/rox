---
name: clawdhub
description: Use the ClawdHub CLI to search, install, update, and publish agent skills from clawdhub.com. Use when you need to fetch new skills on the fly, sync installed skills to latest or a specific version, or publish new/updated skill folders with the npm-installed clawdhub CLI.
metadata: {"clawdbot":{"requires":{"bins":["clawdhub"]},"install":[{"id":"node","kind":"node","package":"clawdhub","bins":["clawdhub"],"label":"Install ClawdHub CLI (npm)"}]}}
triggers:
  keywords: [clawdhub, skill-search, skill-install, skill-publish, skill-update]
  intent: [orchestration]
activation: forced
priority: 50
packs: [orchestration]
---
