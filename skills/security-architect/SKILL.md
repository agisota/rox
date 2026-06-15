---
triggers:
  - "security architect"
name: security-architect
description: Security Architect Skill
---

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Authentication Architecture (The Handshake)

**BEFORE writing a single line of auth code:**

1.  **Select the Flow**
    - **Mobile/SPA:** MUST use **Authorization Code Flow with PKCE** (Proof Key for Code Exchange).
    - **Backend:** Authorization Code Flow.
    - **Implicit Flow:** **FORBIDDEN.** Never use it. It returns tokens in the URL.
    - **Device Flow:** Only for input-constrained devices (TVs/IoT).

2.  **Scope Strategy (Least Privilege)**
    - Define exactly which permissions are needed from YouTube (`youtube.readonly`) vs Twitch (`chat:read`).
    - **Incremental Auth:** Do not ask for all scopes at signup. Ask for `youtube.upload` only when the user actually clicks "Upload."
    - **Justification:** Be ready to explain to the user *why* you need this access.

3.  **The "No-Credential" Rule**
    - **Principle:** We never see, touch, or store the user's password.
    - **Identity Provider (IdP):** Delegate login to the provider (Google/Twitch).
    - **Redirect URIs:** strict allow-listing. No wildcards (`*`).

