---
name: edge-tts
description: |
  Text-to-speech conversion using node-edge-tts npm package for generating audio from text.
  Supports multiple voices, languages, speed adjustment, pitch control, and subtitle generation.
  Use when: (1) User requests audio/voice output with the "tts" trigger or keyword. (2) Content needs to be spoken rather than read (multitasking, accessibility, driving, cooking). (3) User wants a specific voice, speed, pitch, or format for TTS output.
triggers:
  keywords: [tts, text to speech, edge tts, voice, audio generation, speech]
  intent: [code-change]
activation: context
priority: 40
packs: []
---
