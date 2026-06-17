# Rox Agent-Native Team OS — technical integration design

Дата: 2026-06-17

## 0. Scope

Цель: превратить Rox в единую agent-native team operating system, где solo developer OS,
team collaboration и live voice operations работают как один продуктовый слой.

Источники/референсы:
- Agent-Native: https://www.agent-native.com/docs
- Agent-Native templates: https://www.agent-native.com/templates
- Agent-Native repository: https://github.com/BuilderIO/agent-native
- Liveblocks: https://liveblocks.io/
- LiveKit Agents: https://docs.livekit.io/agents/
- LiveKit agent dispatch: https://docs.livekit.io/agents/server/agent-dispatch/
- Huly docs: https://docs.huly.io/

Current Rox anchors:
- Agent registry: `packages/db/src/schema/agent.ts`
- Agent bridge protocol/context/commands: `packages/agent-bridge/src/**`
- Composer controls: `apps/web/src/app/(agents)/components/AgentPromptInput/**`
- Knowledge documents/backlinks: `packages/db/src/schema/knowledge.ts`
- Journal memory: `packages/db/src/schema/journal.ts`
- Workflow/skill enums and surfaces: `packages/db/src/schema/enums.ts`
- Existing super-app roadmap: `plans/rox-superapp-roadmap-and-design.md`
- Existing agent-native implementation plan: `plans/agent-native/plan.md`

Non-goals for this design:
- Do not replace Drizzle/Postgres/Electric as Rox's source of truth.
- Do not replace Rox with Huly.
- Do not store plaintext credentials.
- Do not apply production migrations as part of design.
- Do not make Liveblocks the canonical database.

## 1. Product thesis

Rox should expose one object graph across people, agents, documents, tasks, calls, chat,
files, templates, workflows, and external systems.

In the target state:
- A human can click a UI action.
- An agent can call the same action.
- A teammate can comment on the same object in realtime.
- A voice agent can join the same work room.
- Every result lands back in the same object graph with provenance.

## 2. Platform layering

### 2.1 Source of truth

Canonical state remains in Rox:
- Postgres/Drizzle for durable cloud state.
- Local DB/Electric/TanStack DB for cache-first client rendering.
- `knowledge_documents`, `journal_entries`, `agent_sources`, workflow/skill tables as existing seeds.

### 2.2 Realtime collaboration

Liveblocks should own interaction state:
- Presence.
- Cursors/selections.
- Comment threads.
- Collaborative editor transient state.
- Room membership and live annotations.

Rox persists canonical snapshots and provenance:
- Final document state.
- Comment/thread references.
- Activity events.
- Object relationships.

### 2.3 Realtime media and voice agents

LiveKit should own media/session transport:
- Voice/video rooms.
- Agent participants.
- Speech/transcript stream.
- Agent dispatch to rooms.
- Realtime observability and interruption events.

Rox persists:
- `live_sessions`.
- `agent_dispatches`.
- Transcripts as `knowledge_documents` or graph objects.
- Meeting notes, action items, summaries, recordings.

### 2.4 Agent-native runtime

Rox already has the start of this layer:
- `agent_sources` as first-class external backends.
- `agent-native.embed` compatible envelope.
- Whitelisted screen context.
- UI command allow-list.
- Composer source/skill/status controls.

Needed next:
- Broader command schema.
- Object context packets.
- Agent dispatch records.
- Tool/action registry shared by UI and agents.
- Template import/instantiate lifecycle.

### 2.5 Huly-like project OS

Huly is treated as a product/domain reference:
- Projects.
- Issues/tasks.
- Docs.
- Chat.
- Meeting notes.
- Team processes.
- Optional import/export bridge.

Rox should model these as object kinds and views, not as a separate backend.

## 3. Proposed base data model

### 3.1 Core graph

Add or materialize the core graph proposed in `plans/rox-superapp-roadmap-and-design.md`.

Tables:
- `rox_objects`
- `rox_edges`
- `object_identities`
- `object_activity_events`
- `external_mappings`

Suggested object kinds:
- `project`
- `workspace`
- `doc`
- `task`
- `chat_thread`
- `comment_thread`
- `live_room`
- `live_session`
- `agent_source`
- `agent_run`
- `agent_dispatch`
- `template_blueprint`
- `template_instance`
- `canvas`
- `file`
- `contact`
- `customer_signal`
- `meeting`
- `transcript`
- `journal_entry`
- `workflow`

Suggested edge relations:
- `contains`
- `links_to`
- `mentions`
- `assigned_to`
- `generated_by`
- `summarizes`
- `derived_from`
- `blocks`
- `depends_on`
- `comments_on`
- `discusses`
- `opened_from`
- `participates_in`
- `dispatches`
- `implements`
- `observes`
- `maps_to_external`

### 3.2 Collaboration tables

Add:
- `collaboration_rooms`
- `collaboration_room_members`
- `collaboration_snapshots`
- `collaboration_comment_threads`

Fields:
- `organization_id`
- `v2_project_id`
- `object_id`
- `provider` (`liveblocks`, later `internal`)
- `provider_room_id`
- `room_kind` (`doc`, `canvas`, `task`, `incident`, `meeting`, `review`)
- `policy`
- `last_snapshot_ref`
- `created_by`
- `created_at`
- `updated_at`

### 3.3 Live session tables

Add:
- `live_sessions`
- `live_session_participants`
- `live_session_events`
- `live_session_recordings`

Fields:
- `livekit_room_name`
- `object_id`
- `status` (`scheduled`, `active`, `ended`, `failed`)
- `mode` (`voice`, `video`, `screen_share`, `agent_only`)
- `transcript_object_id`
- `summary_object_id`
- `recording_storage_ref`
- `started_at`
- `ended_at`

### 3.4 Agent dispatch tables

Add:
- `agent_dispatches`
- `agent_dispatch_events`
- `agent_tool_calls`
- `agent_ui_commands`

Fields:
- `agent_source_id`
- `target_object_id`
- `collaboration_room_id`
- `live_session_id`
- `prompt`
- `status` (`queued`, `running`, `waiting_approval`, `succeeded`, `failed`, `canceled`)
- `requested_by_user_id`
- `model_ref`
- `tool_policy`
- `result_object_id`
- `error`

### 3.5 Template tables

Add:
- `template_blueprints`
- `template_blueprint_actions`
- `template_blueprint_schema`
- `template_instances`
- `template_instance_objects`

Fields:
- `source` (`agent_native`, `rox`, `imported`)
- `external_template_id`
- `name`
- `description`
- `instructions`
- `schema_json`
- `actions_json`
- `seed_data_json`
- `permissions_manifest`
- `version`
- `status`

## 4. Cross-cutting data flow

### 4.1 Opening an object

1. User opens a doc/task/canvas/live room.
2. Client resolves `rox_objects` from local cache.
3. tRPC ensures `collaboration_rooms` exists for that object.
4. Server issues Liveblocks token for the provider room.
5. Client subscribes to presence/comments/editor state.
6. Canonical object content remains persisted in Rox.

### 4.2 Invoking an agent

1. User selects agent source and skills in the composer.
2. Client sends prompt + current object context.
3. Server creates `agent_dispatches`.
4. Runtime resolves `agent_sources` credentials and tools.
5. Agent receives whitelisted object/screen context.
6. Agent emits tool calls and UI commands.
7. Rox persists events, generated docs/tasks/comments, and result links.

### 4.3 Starting a live room

1. User starts room from a task/project/doc/incident.
2. Server creates `live_sessions` and LiveKit room token.
3. LiveKit worker dispatches configured agents.
4. Transcript stream becomes live `transcript` object.
5. Summary/action extraction creates docs/tasks and edges.
6. Room close persists final transcript, recording refs, and timeline.

### 4.4 Importing a template

1. User picks Agent-Native template or Rox blueprint.
2. Server imports schema/actions/instructions into `template_blueprints`.
3. Preview creates sandbox `template_instance`.
4. Publish instantiates objects, workflows, skills, and rooms.
5. Generated objects are linked to the blueprint and project.

## 5. Screens and views

New top-level views:
- `Rox Rooms`: active rooms, docs, calls, agents, blockers.
- `Project OS`: tasks/docs/chat/calendar/roadmap in one shell.
- `Agent Sources`: configure and test external agents.
- `Template Gallery`: import, preview, fork, instantiate templates.
- `Live Operations`: LiveKit room list, participants, transcripts, tool calls.
- `Collaboration Inbox`: comments, mentions, approvals, agent asks.
- `Object Graph`: relationships between tasks, docs, calls, agent runs.

Object-level panels:
- Context panel.
- Participants/presence panel.
- Comment thread panel.
- Agent activity panel.
- Timeline/provenance panel.
- Linked objects panel.

## 6. Integration detail matrix

Each row describes required technical changes, data flow, views, and processes.

### 6.1 Agent-Native integrations

| # | Integration | Technical changes | Data flow | Views | New processes |
| --- | --- | --- | --- | --- | --- |
| AN-1 | Agent Source Marketplace | Extend `agent_sources` with marketplace metadata, health status, scopes, setup schema. Add `agentSource.test`, `agentSource.install`, `agentSource.rotateSecret`. | User installs source -> encrypted config stored -> health check -> source appears in composer. | Agent Sources, source detail, setup wizard. | Source certification, health polling, credential rotation. |
| AN-2 | Embedded App Surfaces | Add `embedded_surface` object kind and `agent_embed_sessions`. Extend bridge ready/message lifecycle. | Agent/template opens embedded iframe -> handshake over `agent-native.embed` -> context and commands flow both ways. | Embedded surface panel, modal, side pane. | Surface registration, origin allow-list review, session cleanup. |
| AN-3 | Shared Action Model | Add `action_registry` or reuse skills with `surface=object_action/agent_tool/api`. Add typed action input/output schemas. | UI click and agent tool call both call the same server action -> output persisted as object event. | Command palette, object action menu, agent tool browser. | Action review, permission binding, audit logging. |
| AN-4 | Screen Context Bus | Extend `ContextPacket` from route/selection to object/project/file/task/live room context. Keep strict allow-list. | Client publishes context -> runtime attaches it to dispatch -> agent sees only reviewed fields. | Context preview/debug drawer. | Context schema review, redaction rules, context freshness expiry. |
| AN-5 | UI Command Router | Extend command union beyond `navigate`: `openObject`, `createObject`, `comment`, `assignTask`, `startLiveRoom`, `runWorkflow`. | Agent emits command -> router validates allow-list -> client executes or asks approval -> ack persisted. | Approval toast, command history, timeline. | Human-in-loop approval, command replay, rejection tracking. |
| AN-6 | A2A Delegation | Add `agent_dispatches.parent_dispatch_id` and delegation edges. Expose dispatch API as tool. | Primary agent creates child dispatch -> child runs with scoped context -> result returns to parent/object. | Agent run tree, delegation graph. | Specialist routing, recursion limits, budget enforcement. |
| AN-7 | Agent Permissions | Add `agent_policies`, `agent_object_grants`, tool scopes. Bind to org/project/object. | Dispatch checks source + object + tool policy before each action. | Policy editor, permission diff, blocked action inbox. | Policy review, least-privilege templates, audit exports. |
| AN-8 | Memory Binding | Link dispatch outputs to `knowledge_documents`, `journal_entries`, and future `memory_items`. | Agent run -> summary/doc/task/memory suggestions -> object graph edges. | Memory suggestions, run summary, journal daily digest. | Memory candidate approval, retention policies, regeneration. |
| AN-9 | Run Replay | Persist `agent_dispatch_events`, `agent_tool_calls`, `agent_ui_commands`. | Runtime event stream -> timeline table -> replay view reconstructs run. | Agent replay, timeline, diff viewer. | Replay retention, redaction, export for debugging. |
| AN-10 | Agent-Native Command Palette | Register actions/templates/workflows in one searchable surface. | User command -> action registry -> same path as agent invocation. | Command palette, quick actions, slash commands. | Action indexing, shortcut assignment, usage analytics. |

### 6.2 Agent-Native template integrations

| # | Integration | Technical changes | Data flow | Views | New processes |
| --- | --- | --- | --- | --- | --- |
| T-1 | Template Import Wizard | Add `template_blueprints` and import parser for manifest/schema/actions/instructions. | URL/package/manual manifest -> normalized blueprint -> validation report. | Template import wizard. | Manifest validation, source provenance, duplicate detection. |
| T-2 | Template-to-Skill Compiler | Convert template actions into `skills` and `skill_bindings`. | Blueprint action -> skill record -> binding surfaces `agent_tool`, `object_action`, `api`. | Template action map, generated skill list. | Compile, dry-run, publish/deprecate. |
| T-3 | Template DB Mapper | Map template schema to `rox_objects` extension fields or typed detail tables. | Schema fields -> object kind/body/schema -> generated migrations only after approval. | Schema mapper, field preview. | Schema review, migration planning, backward compatibility check. |
| T-4 | Template Preview Sandbox | Add `template_instances.status=preview` and isolated project namespace. | Instantiate into preview project -> run sample actions -> discard or publish. | Preview workspace, reset button. | Sandbox cleanup, preview seed refresh. |
| T-5 | Template Marketplace | Add org/project visibility and rating/install metadata. | Published blueprint -> gallery index -> install into project. | Template Gallery, category pages. | Review queue, version moderation, deprecation notices. |
| T-6 | Template Fork/Versioning | Add parent version, local patches, upgrade diff. | User forks blueprint -> local changes -> compare with upstream update. | Version diff, upgrade assistant. | Upgrade compatibility, conflict resolution. |
| T-7 | Permissions Manifest | Store required scopes/tools/data access per template. | Install checks manifest -> user approves grants -> policies generated. | Install permissions screen. | Security review, grant expiry, policy regeneration. |
| T-8 | Seed Generator | Turn template seed data into docs/tasks/workflows/rooms. | Blueprint seed -> `template_instance_objects` -> created project objects. | Generated object checklist. | Rollback, partial failure recovery, seed idempotency. |
| T-9 | Template Evals | Store expected actions, fixtures, success checks. | Blueprint eval -> sandbox run -> pass/fail report. | Template QA report. | Eval scheduling, regression gates, publish blocking. |
| T-10 | Agent Onboarding | Generate source-specific instructions for selected agents. | Blueprint instructions -> agent-source prompt bundle -> composer/run defaults. | Agent setup checklist. | Prompt versioning, source compatibility matrix. |

### 6.3 Liveblocks integrations

| # | Integration | Technical changes | Data flow | Views | New processes |
| --- | --- | --- | --- | --- | --- |
| LB-1 | Presence | Add `collaboration_rooms` and Liveblocks token endpoint. | Object opened -> ensure room -> token -> presence subscription. | Presence avatars in doc/task/canvas. | Room lifecycle, idle cleanup. |
| LB-2 | Collaborative Editor | Bind editor state to Liveblocks room; persist canonical snapshots to `knowledge_documents`/objects. | Live edit -> CRDT state -> periodic/server snapshot -> Rox durable content. | Collaborative doc editor. | Snapshot intervals, conflict recovery, offline fallback. |
| LB-3 | Inline Comments | Map Liveblocks threads to `comment_thread` objects and edges. | User comments on selection/node -> thread metadata includes object/anchor -> persisted ref. | Comment sidebar, inline anchors. | Thread resolution, mention notification, anchor repair. |
| LB-4 | Mentions/Notifications | Bridge Liveblocks mentions to Rox notifications/inbox. | Mention event -> notification object -> inbox + email/slack later. | Collaboration Inbox. | Notification dedupe, read state, escalation. |
| LB-5 | Agent Participant | Represent agent dispatch as room participant with presence metadata. | Agent joins collaboration room -> shows cursor/status -> edits/comments through actions. | Agent avatar, live agent status. | Agent presence timeout, attribution labeling. |
| LB-6 | Collaborative Canvas | Add canvas object model and Liveblocks storage for node positions. | Canvas edits -> realtime state -> object/edge snapshots persisted. | Canvas, graph planner, OSINT board. | Large graph pagination, snapshot compression. |
| LB-7 | Live Task Board | Add realtime board room per project/status view. | Card moved -> Liveblocks update -> validated server action -> task object update. | Kanban board with presence. | Optimistic rollback, drag conflict policy. |
| LB-8 | AI Toolbar | Expose rewrite/summarize/generate as object actions bound to selected editor range. | Selection -> action -> agent dispatch -> replace/insert suggestion. | Editor AI toolbar. | Suggestion approval, diff preview, prompt logging. |
| LB-9 | Durable Snapshots | Add snapshot ref table and background persistence worker. | Realtime room state -> scheduled snapshot -> Rox object update. | Snapshot history, restore. | Snapshot compaction, restore validation. |
| LB-10 | Threads as Objects | Promote comment threads into graph objects. | Thread created/resolved -> object + edges to doc/task/user. | Thread detail page, graph links. | Comment lifecycle, analytics, unresolved thread review. |

### 6.4 LiveKit integrations

| # | Integration | Technical changes | Data flow | Views | New processes |
| --- | --- | --- | --- | --- | --- |
| LK-1 | Voice Room per Object | Add `live_sessions` and token endpoint for object-scoped rooms. | User starts room -> LiveKit room -> participants join -> session row active. | Start call button, room panel. | Room close, failed room recovery. |
| LK-2 | Agent Participant | Add LiveKit worker connected to `agent_sources`. | Room active -> dispatch agent -> agent joins as participant -> emits audio/data/tool calls. | Participant roster with agent badge. | Worker deployment, capacity health, agent disconnect recovery. |
| LK-3 | Live Transcript | Stream STT segments into `transcript` object. | Audio -> STT -> transcript events -> final doc snapshot. | Transcript panel, searchable transcript. | Segment correction, speaker diarization, retention. |
| LK-4 | Contextual Agent Dispatch | Dispatch agents based on object/live room context. | Start room -> server chooses agents from policy/template -> `agent_dispatches`. | Room agent selector. | Auto-dispatch rules, budget checks, manual override. |
| LK-5 | Push-to-Talk Desktop | Add desktop hotkey capture and LiveKit local room/session start. | Hotkey -> audio stream -> agent room -> command/action outputs. | Desktop overlay, tray status. | Mic permissions, hotkey config, local fallback. |
| LK-6 | Meeting Summary | Summarize transcript into docs/tasks/decisions. | Room ended -> summary worker -> objects/edges generated. | Meeting summary page, action checklist. | Summary approval, task assignment, regeneration. |
| LK-7 | Voice-to-UI Commands | Convert voice intent into validated UI commands. | Speech -> intent agent -> command router -> approval/execution. | Voice command overlay. | Confirmation thresholds, undo, command safety policy. |
| LK-8 | Agent Console View | Persist and display latency/tool/RPC/interruption events. | LiveKit/agent events -> `live_session_events` + `agent_tool_calls`. | Live Operations console. | Observability retention, failure triage, SLA alerts. |
| LK-9 | Multi-agent Standup | Scheduled room with planner/executor/reviewer agents. | Calendar/schedule -> room -> agents discuss status -> tasks updated. | Standup room, generated report. | Recurring schedule, attendance, status extraction. |
| LK-10 | Customer Call Capture | Link calls to contacts/projects/signals. | Call -> transcript -> customer signal -> roadmap/task/doc edges. | Customer call page, signal inbox. | Consent capture, CRM mapping, PII redaction. |

### 6.5 Huly-style integrations

| # | Integration | Technical changes | Data flow | Views | New processes |
| --- | --- | --- | --- | --- | --- |
| H-1 | Workspace Shell | Add project OS navigation over object graph. | Project selected -> load docs/tasks/chat/rooms/activity by edges. | Project home, left nav, object switcher. | Workspace provisioning, module enablement. |
| H-2 | Huly Import | Add external mapping/import pipeline for Huly data. | Huly export/API -> normalized objects -> mappings + conflict report. | Import wizard, import report. | Incremental sync, conflict resolution, rollback. |
| H-3 | Issue Board | Model tasks/issues as objects with statuses/priorities/assignees. | Issue create/move -> task object update -> edges to docs/runs/PRs. | Board, list, issue detail. | Triage, sprint planning, status automation. |
| H-4 | Object-linked Chat | Chat threads become objects attached to project/task/doc. | Message/thread -> chat object -> edges to current context. | Project chat, object discussion tab. | Thread archiving, search indexing, moderation. |
| H-5 | Meeting Notes | Meeting note object links live session, transcript, action items. | Live session -> note -> tasks/decisions generated. | Meeting page, notes editor. | Action extraction, owner assignment, follow-up reminders. |
| H-6 | Roadmap Objects | Add roadmap item/milestone/release object kinds. | Task/doc/customer signal -> roadmap relation -> release status. | Roadmap board, release view. | Prioritization, release rollup, dependency checks. |
| H-7 | CRM/Contact Objects | Add contacts/accounts/signals as object kinds. | Call/email/chat/import -> contact signal -> product task/roadmap edge. | Contact/account detail, signal inbox. | Deduping identities, consent/PII handling. |
| H-8 | HR/ATS Later Modules | Keep module design generic through object kinds and schemas. | Future module blueprint -> object kinds/schema/actions. | Module launcher, admin config. | Module governance, template versioning. |
| H-9 | Self-host Bridge | Add import/export bridge and deployment docs for Huly-compatible data. | Huly instance -> connector -> mappings -> Rox project objects. | Connector settings. | Sync health, mapping migration, connector tests. |
| H-10 | Unified Search | Search object graph, docs, comments, calls, tasks, agents. | Query -> lexical/vector/object filters -> results grouped by kind. | Global search, command palette. | Index refresh, permissions filtering, stale result cleanup. |

### 6.6 Combined integrations

| # | Integration | Technical changes | Data flow | Views | New processes |
| --- | --- | --- | --- | --- | --- |
| C-1 | Agent War Room | Compose `collaboration_room`, `live_session`, `agent_dispatch`, task/doc objects. | Incident/task -> room -> people/agents collaborate -> actions and transcript persist. | War room, live timeline. | War-room creation, closeout, postmortem generation. |
| C-2 | Voice-to-PR | Bind LiveKit voice session to agent workflow and GitHub/PR objects. | Voice prompt -> spec doc -> tasks -> agent branch/PR -> review room. | PR mission page. | Approval gates, CI tracking, merge readiness. |
| C-3 | Collaborative Incident Room | Add incident object kind and incident templates. | Alert/manual start -> live room -> agent diagnosis -> tasks/postmortem. | Incident command center. | Severity policy, timeline lock, retrospective. |
| C-4 | AI Product Studio | Combine roadmap, canvas, docs, templates, agents. | Product idea -> template -> collaborative spec/canvas -> tasks/workflows. | Product studio, canvas/spec split view. | Design review, spec approval, handoff to execution. |
| C-5 | Team Code Review Room | Link PR, diff, comments, voice discussion, reviewer agents. | PR opened -> review room -> comments/tasks -> approval summary. | Review room, diff + transcript. | Reviewer assignment, unresolved comment gate. |
| C-6 | Customer Call to Roadmap | Connect LiveKit transcript to CRM signal and roadmap. | Call -> transcript -> insights -> customer signal -> roadmap/task edges. | Signal triage, roadmap impact view. | Signal scoring, duplicate detection, privacy review. |
| C-7 | Multi-agent Planning Board | Use Liveblocks board + agent delegation. | Goal -> planner creates cards -> specialist agents update cards -> reviewer validates. | Planning board, agent run tree. | Budget limits, card ownership, completion gate. |
| C-8 | Template Launchpad | Instantiate Agent-Native template into full Rox room stack. | Template -> objects/workflows/rooms/policies -> launch checklist. | Launchpad, template instance dashboard. | Install, dry-run, publish, rollback. |
| C-9 | Knowledge Capture Loop | Every room/run/comment/call produces knowledge graph updates. | Activity -> summarizer -> docs/journal/memory suggestions -> edges. | Daily digest, memory inbox, graph. | Human approval, retention, stale memory cleanup. |
| C-10 | Operations Command Center | Aggregate active rooms, agents, workflow runs, blockers. | Streams from objects/rooms/dispatches -> command center. | Ops command center. | Escalation, SLA alerts, stuck-run sweeps. |

## 7. Implementation sequencing

### Phase A — Foundation

Files/packages:
- `packages/db/src/schema/{object,collaboration,live,template}.ts`
- `packages/db/src/schema/enums.ts`
- `packages/trpc/src/router/{object,collaboration,live,template,agent-dispatch}/`
- `packages/agent-bridge/src/{context,commands,protocol}/`

Deliverables:
- Object graph schema.
- Collaboration room schema.
- Live session schema.
- Template blueprint schema.
- Agent dispatch schema.
- tRPC CRUD and token endpoints.

Validation:
- Typecheck DB/TRPC.
- Schema migration generated offline only.
- Router unit tests for org scoping and credential redaction.

### Phase B — Agent-native runtime

Files/packages:
- `packages/agent-bridge`
- `packages/chat`
- `packages/trpc`
- `apps/web/src/app/(agents)`
- `apps/desktop`

Deliverables:
- Context v2.
- UI command router v2.
- Agent dispatch event stream.
- Source health/test flow.
- Run replay.

Validation:
- Bridge protocol tests.
- Command allow-list tests.
- Agent dispatch lifecycle tests.

### Phase C — Collaboration

Files/packages:
- `apps/web`
- `apps/desktop`
- `packages/trpc`
- `apps/relay` if a gateway is required.

Deliverables:
- Liveblocks room token endpoint.
- Presence in docs/tasks/canvas.
- Comment threads.
- Collaborative editor/canvas snapshotting.

Validation:
- Room auth tests.
- Snapshot persistence tests.
- Comment metadata mapping tests.

### Phase D — Live rooms

Files/packages:
- `apps/web`
- `apps/desktop`
- New `apps/livekit-worker` or package under `packages/live-runtime`.

Deliverables:
- LiveKit room creation.
- Agent participant dispatch.
- Transcript persistence.
- Meeting summary/action extraction.
- Operations console.

Validation:
- Token scope tests.
- Local worker smoke.
- Transcript-to-doc integration test.

### Phase E — Huly-like project OS

Files/packages:
- `apps/web/src/app/(projects)` or equivalent existing project shell.
- `packages/trpc/src/router/object`
- `packages/trpc/src/router/search`

Deliverables:
- Project OS shell.
- Issue board.
- Object-linked chat.
- Meeting notes.
- Roadmap and signal views.
- Unified search.

Validation:
- Object graph search tests.
- Permissions-filtered search.
- E2E smoke for project -> doc -> task -> room -> agent -> summary.

## 8. First complete vertical slice

Recommended first slice: Collaborative Agent Planning Room.

User story:
1. User opens a project.
2. User starts a planning room.
3. Rox creates a doc, task board, collaboration room, and optional LiveKit room.
4. User invites teammates or starts solo.
5. User dispatches planner agent.
6. Agent writes a draft plan into the collaborative doc.
7. User comments/edits live.
8. Agent turns accepted sections into tasks.
9. Voice discussion transcript is summarized into meeting notes.
10. Journal and knowledge graph receive linked summaries.

Why this slice:
- Uses Agent-Native.
- Uses Liveblocks.
- Uses LiveKit.
- Uses Huly-style docs/tasks/chat/project shell.
- Produces visible customer value without needing every module.

## 9. Risks

- Double source of truth: avoid storing canonical domain data only in Liveblocks.
- Privacy: live audio, transcripts, screen context, and agent memory need explicit policies.
- Security: agent UI commands must stay allow-listed and auditable.
- Cost: live rooms, STT, summaries, embeddings, and multiplayer infra need quotas.
- Complexity: Huly-like breadth must be delivered through modular object kinds, not one giant app rewrite.
- Migration: existing `knowledge_documents`, `journal_entries`, `agent_sources`, workflow data need compatibility shims.

## 10. Decision record

Adopt:
- Drizzle/Electric/Rox object graph as canonical state.
- Liveblocks for collaboration interaction state.
- LiveKit for realtime voice/video/agent rooms.
- Agent-Native as shared action/context/agent protocol layer.
- Huly as product/domain model inspiration and optional import bridge.

Reject:
- Replacing Rox backend with Huly.
- Making Liveblocks the primary database.
- Treating LiveKit as ordinary chat transport.
- Importing templates without permissions/eval/sandbox gates.
