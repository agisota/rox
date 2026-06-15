---
name: google-sheets
description: |
  Google Sheets API integration with managed OAuth. Read and write spreadsheet data, create sheets, apply formatting, and manage ranges. Use this skill when users want to read from or write to Google Sheets. For other third party apps, use the api-gateway skill (https://clawhub.ai/byungkyu/api-gateway).
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
  keywords: [google sheets, spreadsheet, api, read, write, data]
  intent: [data-analysis]
activation: context
priority: 40
packs: [fullstack]
---
