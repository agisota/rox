# @rox/storage

Backend-agnostic object-storage abstraction for the Rox Workspace Suite.

Per the suite's storage decision (D9), Cloudflare **R2** is the primary store and
a self-hosted **MinIO** deployment is the secondary/self-hosted option. Both are
S3-compatible, so this package exposes a single `StorageDriver` contract and two
interchangeable implementations selectable by configuration.

> This is the P0 foundation wave. There is **no live R2 wiring** here — the
> package is unit-tested entirely against a mocked S3 client.

## Contract

```ts
interface StorageDriver {
  readonly kind: "r2" | "minio";
  presignPut(params): Promise<PresignResult>; // signed upload URL
  presignGet(params): Promise<PresignResult>; // signed download URL
  head(ref): Promise<HeadResult>;             // metadata only
  delete(ref): Promise<void>;                 // idempotent delete
  copy(params): Promise<void>;                // server-side copy
  list?(params): Promise<ListResult>;         // optional prefix listing
}
```

`StorageProvider` is an alias of `StorageDriver` for call sites that prefer the
higher-level name.

## Usage

### From environment variables

```ts
import { createStorageProviderFromEnv } from "@rox/storage";

const storage = createStorageProviderFromEnv(process.env);

const { url, expiresAt } = await storage.presignPut({
  key: `users/${userId}/uploads/${fileId}`,
  contentType: "application/octet-stream",
  contentLength: size,
  expiresIn: 600,
});
```

### From an explicit config

```ts
import { createStorageProvider, R2Provider } from "@rox/storage";

const storage = createStorageProvider({
  kind: "r2",
  accountId: process.env.R2_ACCOUNT_ID!,
  bucket: "rox-user-data",
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  },
});

// Or construct a provider directly:
const r2 = new R2Provider(config);
```

## Configuration

`resolveStorageConfig(env)` reads:

| Variable | R2 | MinIO | Notes |
| --- | :-: | :-: | --- |
| `STORAGE_PROVIDER` | ✓ | ✓ | `r2` (default) or `minio` |
| `STORAGE_BUCKET` | ✓ | ✓ | default bucket |
| `STORAGE_ACCESS_KEY_ID` | ✓ | ✓ | |
| `STORAGE_SECRET_ACCESS_KEY` | ✓ | ✓ | |
| `STORAGE_SESSION_TOKEN` | optional | optional | temporary creds |
| `STORAGE_REGION` | optional | optional | R2 defaults to `auto`, MinIO to `us-east-1` |
| `R2_ACCOUNT_ID` | ✓ | — | derives the R2 endpoint |
| `STORAGE_ENDPOINT` | optional | ✓ | R2 endpoint override / MinIO endpoint |
| `STORAGE_FORCE_PATH_STYLE` | — | optional | `false` to disable (MinIO defaults to path-style) |

Missing required variables throw immediately so misconfiguration fails fast at
boot.

## Testing

The S3 client and presigner are injectable, so every operation is verified
against a mock that records the issued S3 commands — no network access required.

```bash
bun test packages/storage
```
