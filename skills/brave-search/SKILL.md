---
name: brave-search
description: Web search and content extraction via Brave Search API. Use for searching documentation, facts, or any web content. Lightweight, no browser required.
triggers:
  keywords: [brave search, web search, search api, find documentation, lookup, web content]
  intent: [research]
activation: context
priority: 50
packs: [research]
---

## Workflow

Use Brave Search as the first-choice lightweight web search path for current facts, documentation lookup, and news digests. Prefer concise, source-backed results over long scraped excerpts.

1. Run the configured search/extract tools for the requested query set.
2. If the task is a scheduled cron/report job, produce only the final report in the final response; do not call messaging/delivery tools.
3. If the user explicitly requests silence when there is no news, return exactly `[SILENT]` only when no sufficiently relevant items were found.
4. For news digests, dedupe repeated syndicated items and prefer primary/vendor sources over aggregators when available.
5. Include timestamps or time-window caveats when using search results to satisfy "latest" / "past N hours" requests.

## Fallbacks when Brave/extract credentials fail

See `references/credential-free-news-fallbacks.md` for copy-pasteable probes and quality criteria.

If Brave Search or web extraction returns auth errors, do not retry in a loop. Switch to credential-free discovery:

- Google News RSS:
  - `https://news.google.com/rss/search?q=<urlencoded query>&hl=en-US&gl=US&ceid=US:en`
  - Useful for recent news and rough publication timestamps.
- DuckDuckGo HTML search:
  - `https://duckduckgo.com/html/?q=<urlencoded query>`
  - Use to resolve Google News redirect/aggregator results to canonical URLs.
- Direct metadata fetch:
  - Fetch canonical pages with a browser-like `User-Agent` and parse `<title>` plus `meta[name=description]` when full extraction is unavailable.
  - Treat 403/blocked pages as a signal to use another reputable source for the same claim.

Avoid repeating a failing provider more than twice in the same turn; preserve progress by using alternate surfaces and disclose verification limits briefly.

## News digest format for this operator

For AI/ML cron digests, use Russian BLUF style:

| # | Новость | Кратко | URL |
|---:|---|---|---|

- Top 5-7 items only.
- Focus order: frontier model releases; open-source AI tooling/frameworks; AI agent developments; GPU/cloud infrastructure; AI policy/regulation.
- End with `Рейтинг релевантности для solofounder, строящего AI agent infrastructure: X/10`.
- If there are no material items in the requested window, output exactly `[SILENT]`.
