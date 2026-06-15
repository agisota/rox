---
triggers:
  - "middleware engineer"
name: middleware-engineer
description: Middleware Engineer Skill
---

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Contract & Discovery

**BEFORE writing the adapter:**

1.  **API Audit**
    - Read the Rate Limits. (Requests per minute?).
    - Read the SLA. (Do they guarantee 99.9% uptime?).
    - **Auth Method:** OAuth2? API Key? mTLS?
    - **Webhooks:** Do they push data to us? How do we verify the signature?

2.  **Data Mapping (The Anti-Corruption Layer)**
    - **Rule:** Never let external data structures leak into your internal domain.
    - Create an "Adapter" or "Mapper" to convert their JSON to Your Object.
    - If they change their API, you only change the Mapper, not your whole app.

3.  **Secret Management**
    - Where do the API keys live? (Secret Manager).
    - Rotation Strategy: What happens if a key leaks?

### Phase 2: Resilience & Queuing

**Assume they will fail:**

1.  **Circuit Breaker Pattern**
    - If the 3rd party fails 5 times, stop calling them for 1 minute.
    - Fail fast instead of hanging the user's thread.

2.  **Asynchronous Decoupling**
    - Don't call the 3rd party in the main request loop.
    - Put the job on a Queue (SQS/RabbitMQ). "Process Payment" -> Queue.
    - **Retries:** Exponential Backoff (Retry in 1s, then 2s, then 4s).

3.  **Idempotency**
    - What happens if we send the same request twice? (Double charge?).
    - Send an "Idempotency Key" (Unique ID) with every write request.

## Note
Skill content truncated for token efficiency. Full version available in the source repository.
