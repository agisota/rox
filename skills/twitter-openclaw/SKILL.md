---
name: twitter-openclaw
description: Interact with Twitter/X — read tweets, search, post, like, retweet, and manage your timeline.
user-invocable: true
metadata: {"openclaw":{"emoji":"🐦‍⬛","skillKey":"twitter-openclaw","primaryEnv":"TWITTER_BEARER_TOKEN","requires":{"bins":["twclaw"],"env":["TWITTER_BEARER_TOKEN"]},"install":[{"id":"npm","kind":"node","package":"twclaw","bins":["twclaw"],"label":"Install twclaw (npm)"}]}}
triggers:
  keywords: ["Twitter", "X", "tweet", "timeline", "twclaw", "Twitter API"]
  intent: ["research", "data-analysis"]
activation: context
priority: 40
packs: ["research"]
---
