// Test environment defaults for `@rox/trpc`.
//
// We run the suite with `bun test --isolate` (each file gets a fresh global) to
// stop cross-file `mock.module` leakage. The trade-off is that files which don't
// mock a heavy dependency now load the REAL module, and several of those validate
// env / construct a client AT MODULE LOAD (env.ts via @t3-oss/env-core, neon(),
// new Resend(), Upstash). Without values they throw and surface as
// "Unhandled error between tests", failing unrelated suites.
//
// This preload seeds harmless dummy values BEFORE any test file is imported.
// `??=` means a real value (the root `.env` bun auto-loads locally, or a CI
// secret) always wins — these only apply when the var is otherwise unset (CI's
// unit-test job, which provides almost nothing). Production is unaffected: this
// file is only ever loaded by `bun test` (see bunfig.toml).
process.env.SKIP_ENV_VALIDATION ??= "1";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DATABASE_URL_UNPOOLED ??= "postgresql://test:test@localhost:5432/test";
process.env.NEXT_PUBLIC_MARKETING_URL ??= "https://marketing.test";
process.env.RESEND_API_KEY ??= "re_test_0000000000000000000000";
process.env.KV_REST_API_URL ??= "https://kv.test";
process.env.KV_REST_API_TOKEN ??= "kv_test_token";
process.env.QSTASH_TOKEN ??= "qstash_test_token";
process.env.QSTASH_CURRENT_SIGNING_KEY ??= "sig_test_current";
process.env.QSTASH_NEXT_SIGNING_KEY ??= "sig_test_next";
process.env.RELAY_URL ??= "https://relay.test";
// @rox/auth + better-auth init (pulled in via @rox/auth/server) reads these at
// load to build its baseURL / cross-subdomain cookie config.
process.env.NEXT_PUBLIC_API_URL ??= "https://api.test";
process.env.NEXT_PUBLIC_WEB_URL ??= "https://web.test";
process.env.NEXT_PUBLIC_ADMIN_URL ??= "https://admin.test";
process.env.NEXT_PUBLIC_DESKTOP_URL ??= "https://desktop.test";
process.env.NEXT_PUBLIC_COOKIE_DOMAIN ??= "test";
process.env.BETTER_AUTH_SECRET ??= "better_auth_test_secret_0000000000";
process.env.BETTER_AUTH_URL ??= "https://api.test";
process.env.GH_CLIENT_ID ??= "gh_client_test";
process.env.GH_CLIENT_SECRET ??= "gh_client_secret_test";
