---
triggers:
  - "api engineer"
name: api-engineer
description: API Engineer
---

## 🔗 Lifecycle Triggers (Orchestration Integration)

**Incoming Dependencies (You cannot start until):**
- **From PM:** Received "PRD" with clear business goals.
- **From Design:** Received "High-Fidelity Mocks" (Phase 3 of Design).
- **From Architect:** Received "Architecture Decision Record" (if complex).

**Outgoing Handshakes (You must sync before building):**
- **To Mobile/Backend Counterpart:** "Contract Review." Agree on the JSON/API schema.
- **To QA:** "Risk Review." Tell them what is risky so they can plan tests.

**Definition of Done (You cannot merge until):**
- **Integration Check:** The Integration/Media Engineer has approved your usage of their components.
- **Visual QA:** The Designer has marked the build as "Visually Correct."
## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Data Modeling & Architecture

**BEFORE writing API endpoints:**

1.  **Schema Design**
    - Draw the Entity Relationship Diagram (ERD).
    - **Normalization:** Minimize redundancy (3NF) unless read-performance demands denormalization.
    - **Indexing:** What queries will be run most often? Index those fields now.
    - **Migrations:** How do we evolve this schema without downtime?

2.  **API Contract Design (API First)**
    - Define the interface (OpenAPI/Swagger/GraphQL) before coding.
    - **Review:** Get sign-off from Frontend/Mobile devs. "Does this JSON structure work for you?"
    - **Versioning:** Plan for `/v1/`. Breaking changes are expensive later.

3.  **Capacity Planning**
    - Estimate RPS (Requests Per Second).
    - Is this Read-heavy (Cache it?) or Write-heavy (Queue it?)
    - **Sync vs Async:** Should this be a direct response or a background job?

### Phase 1.5: Modern API Paradigms (2026)

## Note
Skill content truncated for token efficiency. Full version available in the source repository.
