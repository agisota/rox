---
name: Self-Improving Agent (Proactive Self-Reflection)
slug: self-improving
version: 1.2.10
homepage: https://clawic.com/skills/self-improving
description: Self-reflection + Self-criticism + Self-learning + Self-organizing memory. Agent evaluates its own work, catches mistakes, and improves permanently. Use before starting work and after responding to the user.
changelog: "Sharper setup now lists relevant memory before non-trivial work, with a title that highlights proactive self-reflection."
metadata: {"clawdbot":{"emoji":"🧠","requires":{"bins":[]},"os":["linux","darwin","win32"],"configPaths":["~/self-improving/"]}}
triggers:
  keywords: [self-improving, self-reflection, self-criticism, learn from mistakes, compound learning]
  intent: [review, documentation]
activation: context
priority: 40
packs: [code-quality]
---
