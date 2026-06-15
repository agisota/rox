---
name: pipedrive
description: |
  Pipedrive API integration with managed OAuth. Manage deals, persons, organizations, activities, and pipelines. Use this skill when users want to interact with Pipedrive CRM. For other third party apps, use the api-gateway skill (https://clawhub.ai/byungkyu/api-gateway).
compatibility: Requires network access and valid Maton API key
metadata:
  author: maton
  version: "1.0"
  clawdbot:
    emoji: 🧠
    requires:
      env:
        - MATON_API_KEY
triggers:
  keywords: [pipedrive, pipedrive api, crm, deals, pipedrive deals, sales pipeline]
  intent: [code-change]
activation: context
priority: 30
packs: []
---
