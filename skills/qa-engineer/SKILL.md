---
triggers:
  - "qa engineer"
name: qa-engineer
description: QA Engineer Skill
---

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Test Planning (Shift Left)

**BEFORE code is written:**

1.  **Analyze the Requirements (Static Testing)**
    - Read the PRD/Ticket.
    - **Find Logical Holes:** "What happens if the user has no internet?" "What if the date is in the past?"
    - Challenge the PM/Dev: "How can we test this?"
    - **Goal:** Prevent bugs *before* they are coded.

2.  **Define the Test Strategy**
    - What is the scope? (UI only? API? Database?)
    - What devices/browsers must we support?
    - Do we need test data? (e.g., a user with an expired credit card).

3.  **Risk Assessment**
    - What is the impact of failure? (Critical/High/Low).
    - Focus effort on the high-risk areas. You cannot test everything.

### Phase 2: Test Execution (Manual/Exploratory)

**Finding the unknown unknowns:**

1.  **Sanity / Smoke Test**
    - Does the build even launch?
    - **Runtime Symbol Audit (MANDATORY):** Verify all imported symbols (e.g., `crypto`, `fs`) are defined.
    - **Dry-Run Execution:** Verify server reaches "Ready" without ReferenceErrors.
    - If this fails, reject the build immediately.

2.  **Exploratory Testing**
    - Don't just follow a script. Be a detective.
    - Try to break it: Double click buttons. Enter emojis in name fields. Use back buttons.
    - Change network speed (Throttling) to see how it handles slow loading.

3.  **Cross-Platform Verification**

## Note
Skill content truncated for token efficiency. Full version available in the source repository.
