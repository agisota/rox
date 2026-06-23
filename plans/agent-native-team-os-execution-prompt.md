# Execution prompt — Agent-Native Team OS experimental feature flags

Use this prompt to launch a new Codex/OMX/Open Dynamic Workflow execution pass.

```text
You are working in /home/dev/1/rox, the Rox Bun/Turbo monorepo. Follow AGENTS.md strictly.

Mission:
Implement the experimental feature flag/control plane for the Agent-Native Team OS plan, then wire every planned integration behind user-facing toggles in Settings -> Experiments. All listed features must be default-on for users, but individually disableable. Features that require external provider config must remain default-on in preference state, but show "needs configuration" and no-op safely until credentials/provider setup exists.

Authoritative planning docs:
- plans/agent-native-team-os-integrations-design.md
- plans/rox-superapp-roadmap-and-design.md
- plans/agent-native/plan.md

Current repo anchors to inspect before editing:
- packages/shared/src/constants.ts
- packages/db/src/schema/agent.ts
- packages/db/src/schema/knowledge.ts
- packages/db/src/schema/journal.ts
- packages/db/src/schema/enums.ts
- packages/agent-bridge/src/protocol/protocol.ts
- packages/agent-bridge/src/context/context.ts
- packages/agent-bridge/src/commands/commands.ts
- apps/desktop/src/renderer/routes/_authenticated/settings/experimental/**
- apps/desktop/src/renderer/stores/settings-state.ts
- packages/local-db/src/schema/schema.ts
- packages/trpc/src/router/workflow/**
- packages/workflow-core/**

Hard constraints:
- Do not touch production DB or run drizzle migrate/push.
- Do not hand-edit packages/db/drizzle files. If schema migration is required, modify schema only and use drizzle-kit generate offline.
- Do not store plaintext credentials.
- Do not create one-off untyped if-statements for flags. Build a typed registry and use shared helpers.
- Do not hide existing data because readiness/loading is false. Preserve AGENTS.md cache-first rule.
- No new external dependency unless the lane proves it is necessary and documents why.
- Keep features default-on, user-disableable, documented, searchable, and covered by tests.
- Max 6 concurrent agents. Avoid parallel agents editing the same files.

Definition of done:
1. A typed experimental feature registry exists with all feature IDs below.
2. Every feature has title, short description, long description, category, defaultEnabled=true, maturity, dependencies, affected surfaces, owner, flag type, kill switch, telemetry name, and docs link.
3. User preferences can override every feature on/off.
4. Settings -> Experiments renders all features as grouped toggles with search, dependency/configuration badges, reset-to-default, and clear descriptions.
5. Code can query effective feature state from shared helpers in desktop/web/backend-safe contexts.
6. Planned integration entry points are gated by the registry, even if the heavy implementation is stubbed behind safe "coming soon / needs configuration" surfaces.
7. docs/feature-flags.md documents the lifecycle, owner, kill switch, cleanup policy, and all 60 flags.
8. Tests cover registry completeness, default-on behavior, persistence, effective-state resolution, Settings UI rendering, and at least one gated surface per category.
9. Run targeted tests/typecheck/lint. Report exact commands and results.

Feature IDs to implement:

Agent-Native:
- agentNative.sourceMarketplace
- agentNative.embeddedSurfaces
- agentNative.sharedActionModel
- agentNative.screenContextBus
- agentNative.uiCommandRouter
- agentNative.a2aDelegation
- agentNative.permissions
- agentNative.memoryBinding
- agentNative.runReplay
- agentNative.commandPalette

Agent-Native Templates:
- templates.importWizard
- templates.skillCompiler
- templates.dbMapper
- templates.previewSandbox
- templates.marketplace
- templates.forkVersioning
- templates.permissionsManifest
- templates.seedGenerator
- templates.evals
- templates.agentOnboarding

Liveblocks Collaboration:
- collaboration.presence
- collaboration.editor
- collaboration.inlineComments
- collaboration.mentionsNotifications
- collaboration.agentParticipant
- collaboration.canvas
- collaboration.taskBoard
- collaboration.aiToolbar
- collaboration.durableSnapshots
- collaboration.threadsAsObjects

LiveKit Live Rooms:
- live.voiceRooms
- live.agentParticipant
- live.transcript
- live.contextualDispatch
- live.pushToTalkDesktop
- live.meetingSummary
- live.voiceCommands
- live.agentConsole
- live.multiAgentStandup
- live.customerCallCapture

Huly-style Project OS:
- projectOs.workspaceShell
- projectOs.hulyImport
- projectOs.issueBoard
- projectOs.objectLinkedChat
- projectOs.meetingNotes
- projectOs.roadmapObjects
- projectOs.crmContacts
- projectOs.futureModules
- projectOs.selfHostBridge
- projectOs.unifiedSearch

Combined Workflows:
- rooms.agentWarRoom
- rooms.voiceToPr
- rooms.incidentRoom
- rooms.productStudio
- rooms.codeReviewRoom
- rooms.customerCallToRoadmap
- rooms.multiAgentPlanningBoard
- rooms.templateLaunchpad
- rooms.knowledgeCaptureLoop
- rooms.operationsCommandCenter

Required architecture:

Shared registry:
- Add a shared typed registry module, preferably in packages/shared, e.g. packages/shared/src/experimental-features/.
- Export:
  - EXPERIMENTAL_FEATURES
  - ExperimentalFeatureId
  - ExperimentalFeatureCategory
  - getExperimentalFeatureDefinition(id)
  - listExperimentalFeatures()
  - resolveExperimentalFeatureState(definition, overrides, dependencyState)
- Keep FEATURE_FLAGS in packages/shared/src/constants.ts for rollout/access flags, but do not overload it with user preference metadata unless the existing pattern clearly supports it.

Persistence:
- For desktop, add a normalized local table rather than 60 boolean columns:
  - experimental_feature_overrides
  - feature_id text primary key
  - enabled boolean
  - updated_at integer
  - source text optional ("user", "migration", "reset")
- Add local-db accessors/hooks/router procedures following existing settings patterns.
- For web/server, if a user/org preference model already exists, use it; otherwise implement the shared registry and leave web persistence as a typed TODO only if implementing it would require unrelated auth/account scope work.

Effective state:
- defaultEnabled=true for all features.
- User override false disables the feature.
- User override true enables preference, but feature may still return status "needs_configuration" if provider keys/config are missing.
- Admin/org kill switch, if existing infrastructure supports it, must override user state.
- Effective state shape:
  {
    id,
    enabled,
    defaultEnabled,
    userOverride,
    availability: "available" | "needs_configuration" | "not_implemented" | "blocked",
    reason?,
    dependencies,
  }

Settings -> Experiments UI:
- Reuse existing component structure under apps/desktop/src/renderer/routes/_authenticated/settings/experimental/.
- Add grouped sections:
  - Agent-Native
  - Templates
  - Collaboration
  - Live Rooms
  - Project OS
  - Combined Workflows
- Each row: switch, title, short description, maturity badge, availability badge, affected surfaces, "learn more" anchor.
- Include search over title/id/description.
- Include "Reset all to defaults".
- Keep layout dense and operational, not marketing-like.

Gated entry points:
- Add a small gating helper that UI surfaces can use:
  - useExperimentalFeature(id)
  - ExperimentalFeatureGate component if this matches local patterns
- Gate existing/new entry points:
  - Agent Sources / composer controls for Agent-Native features.
  - Template Gallery placeholder for template features.
  - Collaboration room buttons/panels for Liveblocks features.
  - Live Operations/voice room buttons for LiveKit features.
  - Project OS shells/views for Huly-style features.
  - Combined room/workflow launchers.
- Disabled toggle behavior:
  - Hide or replace entry point with "disabled in Experiments".
  - Never break existing current workflows.

Docs:
- Create/update docs/feature-flags.md.
- Include every flag with:
  - owner
  - type: Experiment or Operational
  - default
  - kill switch path
  - dependency/provider config
  - telemetry event
  - cleanup/retirement trigger

ODW / multi-agent execution plan:

Run as an orchestrated workflow with these lanes:

Lane 1: repo-mapper
- Read current settings, local-db, shared constants, agent-bridge, workflow packages.
- Output exact files to touch and conflict map.
- No edits.

Lane 2: registry-and-docs
- Implement shared feature registry with all 60 definitions.
- Add docs/feature-flags.md.
- Add registry tests.
- Avoid settings UI files.

Lane 3: persistence-and-state
- Implement desktop local persistence for user overrides.
- Add effective-state resolver and hooks/router accessors.
- Add tests for default-on, override false, reset default, dependency status.
- Avoid Settings UI layout unless necessary for integration.

Lane 4: experiments-ui
- Implement Settings -> Experiments grouped toggles, search, badges, reset.
- Use existing settings component structure.
- Add component tests if the repo has a pattern; otherwise add focused logic tests.
- Avoid schema changes.

Lane 5: gated-surfaces
- Add low-risk gated entry points/placeholders for categories:
  - Agent Sources / composer controls.
  - Template Gallery.
  - Collaboration Rooms.
  - Live Operations.
  - Project OS.
  - Combined Workflows.
- Do not fake external provider integrations. Surface "needs configuration" or "not implemented" states.

Lane 6: verification
- After lanes 2-5 finish, integrate conflicts.
- Run targeted tests first, then broader checks:
  - bun test for touched packages
  - package typechecks for touched packages
  - bun run lint
- If full monorepo checks are too slow or blocked, run the strongest feasible subset and document exact blockers.

ODW shape:
- If using Open Dynamic Workflow JS, create a new plan file under plans/, e.g. plans/agent-native-team-os-feature-flags.odw.js.
- Follow the existing style in plans/rox-desktop-fixes.odw.js:
  - export meta
  - define COMMON prompt
  - define lane prompts
  - phase("Implement")
  - parallel([...agent(...)])
  - require each lane to return structured JSON
- Use a fan-in verifier step after parallel lanes.

Required lane output schema:
{
  "summary": "what changed",
  "filesChanged": ["..."],
  "testsRun": ["command -> result"],
  "risks": ["..."],
  "followUps": ["..."],
  "status": "done" | "blocked"
}

Validation commands to prefer:
- bun test packages/shared packages/local-db packages/trpc
- bun turbo run typecheck --filter=@rox/shared --filter=@rox/local-db --filter=@rox/desktop --filter=@rox/trpc
- bun run lint

Final response:
- Summarize what was implemented.
- List feature catalog count and categories.
- Link key files.
- Include exact verification evidence.
- List remaining real blockers only.
- Do not claim external Liveblocks/LiveKit/Huly integrations are complete unless they are actually functional and tested.
```
