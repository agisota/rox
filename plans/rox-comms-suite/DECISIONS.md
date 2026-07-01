# Rox Workspace Suite — Locked Decisions (owner-confirmed 2026-06-20)

These resolve the P0-blocking open questions from MASTER-PLAN.md §7. Build to these.

- **DQ1 — Storage provider:** Cloudflare **R2 is the public Drive primary** on the Cloudflare account that owns the `rox.one` zone. Owner will enable R2 (billing past free tier) + allow the `rox-drive` bucket. `aws-swiss-migration` MinIO = private cold/DR copy only (never public hot path). Render rejected for storage.
- **DQ2 — Quota / overage:** **10 GiB free PER USER**, a **single shared quota** across Drive + chat attachments + email attachments. **Soft-meter** on exceed: uploads beyond 10 GiB debit the WS-E token economy (`rox_ledger` kind `drive_overage`); existing files stay readable; never hard-blocked at the cap. (`storage_quota.quota_bytes = 10 GiB` seeded lazily, atomic `bytes_used`.)
- **DQ3 — Identity scope:** `username@rox.one` mail / calendar / unified inbox are **GLOBAL per user** (owned by the person, single across all their orgs). Teams/orgs layer shared channels/calendars on top; personal `@rox.one` is never siloed per org.
- **DQ4 — Handle recycling:** a **previously-active handle is reserved permanently** (never reassigned) to prevent inheriting a predecessor's mail/messages/JID; on rename, the old addresses **alias to the new owner for 90 days** then retire. Applies atomically across D1 identity + D3 email + D4 XMPP.

## Build sequencing implication
P0 foundation that needs NO live R2 (build now): `packages/db` schema additions (`comms_*`, `drive_*`, `storage_quota`), `@rox/storage` (StorageProvider interface + R2Provider + MinioProvider, S3-mocked tests), `packages/comms-core` (TransportAdapter contract + router + InAppAdapter), identity `provisionIdentity` + quota engine (unit-tested). Live-R2 integration (bucket create, `drive.rox.one` bind, end-to-end upload) is gated on the owner enabling R2 + R2 credentials.
