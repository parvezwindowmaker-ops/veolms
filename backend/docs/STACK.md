# Stack reference & package notes

Reference for the VeoLMS backend dependencies: the exact versions in use, why, and
the usage notes / gotchas gathered from each package's docs. Update this when you bump a major.

_Last updated: 2026-06 (Node 24 LTS, TypeScript 6)._

## Version matrix

| Package | Version | Notes |
| --- | --- | --- |
| node | 24 LTS (runtime) | Dockerfile base `node:24-alpine`; `@types/node` tracks this major |
| typescript | ^6.0.3 | stable; `module`/`moduleResolution` = `NodeNext` |
| tsx | ^4.22.4 | dev runner (`tsx watch`) |
| express | ^5.2.1 | v5 (async errors auto-forward) |
| sequelize | ^6.37.8 | **v6, not v7** (v7 is still `alpha`) |
| pg / pg-hstore | ^8.22.0 / ^2.3.4 | Postgres driver for Sequelize |
| ioredis | ^5.11.1 | Redis client |
| jsonwebtoken | ^9.0.3 | JWT sign/verify |
| bcryptjs | ^3.0.3 | bundles its own types (no `@types/bcryptjs`) |
| multer | ^2.2.0 | `@types/multer` ^2.1.0 matches v2 |
| dotenv | ^17.4.2 | use `quiet: true` |
| dompurify + jsdom | ^3.4.11 / ^29.1.1 | server-side HTML sanitization |
| @aws-sdk/client-s3 + s3-request-presigner | ^3.x | Cloudflare R2 (S3-compatible) client + presigned URLs |
| Razorpay | (no dep) | payments via the **Orders REST API** (`fetch` + Basic auth) + `crypto` HMAC, deliberately **no SDK** |
| express-rate-limit | ^7.5.1 | v7 supports Express 5; in-memory store (swap for Redis store to scale horizontally) |
| ffmpeg | system (alpine pkg) | encrypted-HLS transcode of uploaded video; installed in the Dockerfile, invoked via `child_process` |
| cors | ^2.8.6 | CORS allowlist for the JSON API (`*` becomes "reflect origin") |
| helmet | ^8.2.0 | secure HTTP headers (CSP/HSTS/etc.) on the JSON API |
| nodemailer | ^9.0.1 | password-reset + contact email; SMTP when configured, else console fallback |
| vitest | ^4.1.9 (dev) | unit tests for pure logic (`npm test`) |

`npm outdated` to check; `npm view <pkg> dist-tags` to confirm stable vs alpha/beta before bumping a major.

## Why not the newest of everything

- **Sequelize 6, not 7.** v7 is a TS-first rewrite, but it's published only under the `alpha` dist-tag. Stay on v6 until `latest` points at 7.
- **`@types/node` = 24, not 26.** `@types/node` must match the Node.js runtime major (we run Node 24). Using 26 types against a 24 runtime exposes APIs that don't exist at runtime.
- **`uuid` advisory (GHSA-w5hq-g745-h8pq).** `uuid` is a *transitive* dep of Sequelize, not ours. The vuln is only in the `buf`-argument path, which neither our code (BIGSERIAL ids, no uuid) nor Sequelize's internal use hits. `npm audit fix --force` would downgrade Sequelize to 3.x, so do **not** run it. Clears when Sequelize bumps uuid.

## Per-package notes

### TypeScript 6
- `tsconfig`: `module`/`moduleResolution` = **`NodeNext`** (the old `node`/`node10` is deprecated and errors-with-warning in TS 6). NodeNext + a CommonJS `package.json` (no `"type":"module"`) emits CommonJS and still allows extensionless relative imports.
- `strict` + `noUnused*` + `noImplicitReturns` on. Underscore-prefixed params (`_req`, `_next`) are exempt from no-unused; they're used for Express error-handler signatures.

### Express 5 (migration notes)
- **Rejected promises in handlers auto-forward to error middleware.** Our `asyncHandler` is therefore redundant but kept (harmless, explicit, version-agnostic).
- **`req.body` is `undefined` when unparsed** (was `{}` in v4), so always `req.body ?? {}` / `req.body?.x`. We do.
- `req.query` is a read-only getter now (we only read it).
- Wildcard routes need names (`/*splat`); we use none. `app.use(handler)` for 404/error still fine.
- `app.listen(port, cb)` cb may receive an error arg.

### Sequelize 6 + TypeScript
- Model pattern: `class X extends Model<InferAttributes<X>, InferCreationAttributes<X>>` with `declare` fields; `CreationOptional<>` for id/timestamps/defaulted columns; `ForeignKey<number>` for FK columns; **`NonAttribute<>` for association properties** (`declare role?: NonAttribute<Role>`) so they're excluded from attribute inference.
- Timestamp columns must still be listed in `Model.init` (`createdAt: DataTypes.DATE`) to satisfy the types.
- **BIGINT returns a string** from `pg` by default → set `pg.defaults.parseInt8 = true` (in `db/sequelize.ts`) to get JS numbers. Safe under `Number.MAX_SAFE_INTEGER`.
- Associations are defined once in `db/associations.ts` (`defineAssociations()`), called before `sync()`. Use `as` aliases (`role`, `menu`, `parent`, `children`) and the same alias in `include`.
- Scopes: `defaultScope` filters every query; a named `.scope()` or `.unscoped()` overrides it. We exclude `password` by default and `unscoped()` in login.
- Hooks: `beforeSave` (create+update) hashes password guarded by `user.changed('password')`. Hooks run on **instance** `.save()`/`.create()`, **not** on static `Model.update()` unless `individualHooks: true`, so update flows fetch the instance and `.save()`.
- Write integrity: multi-step writes (e.g. permission replace) use `sequelize.transaction(...)`.

### ioredis 5
- `new Redis(url, { maxRetriesPerRequest: 2 })`; connects eagerly. `redis.set(key, val, 'EX', seconds)` for TTL; `redis.del(k1, k2)` multi-key.
- Treat as a **cache**: every read is wrapped so a Redis outage falls back to Postgres instead of failing the request (see `services/permission-cache-service.ts`).

### jsonwebtoken 9
- `jwt.sign(payload, secret, { expiresIn })` with `expiresIn` = `JWT_EXPIRES_IN` (default `7d`).
- `jwt.verify` throws on a bad or expired token, which `auth_middleware` catches and turns into a 401.
- The signed JWT is the **bearer access token**: `login`/`register`/`become-instructor` return it in the response body (`{ message, token, data, permissions }`), the SPA stores it in `localStorage`, and sends it as `Authorization: Bearer <token>`. It is stateless (no server-side session to revoke; logout is client-side, the token stays valid until it expires). JWTs also back the short-lived HLS playback tickets (`services/hls-ticket.ts`).

### nodemailer 9 (transactional email)
- `createTransport({ host, port, secure, auth })` from `SMTP_*`. When SMTP is unset, `email-service.ts` logs the message + action link to the console so forgot-password is testable with no mail account.
- Used for: password reset (1h token) and contact-form forwarding.

### vitest 4 (tests)
- `npm test` (`vitest run`) covers the pure, security-critical logic without Postgres/Redis/R2: payment + webhook HMAC verification, pricing rules, id/int validation, search-filter whitelisting, HLS tickets. `test/setup.ts` sets env before `config/env.ts` loads. Integration tests that need a live DB are out of scope (they'd need a throwaway Postgres).

### bcryptjs 3
- Ships its own types, so **do not install `@types/bcryptjs`** (deprecated stub).
- API unchanged: `bcrypt.hash(pw, rounds)` (generates salt internally, used in the model hook), `bcrypt.compare(pw, hash)`.

### multer 2
- `@types/multer` ^2.x matches v2. API as before: `multer.diskStorage({destination, filename})`, `multer({ storage, limits, fileFilter })`, `upload.single('field')`, `req.file`.
- We harden it: 5 MB limit, image-only `fileFilter` (throws `ApiError`), sanitized filenames. Multer must run **before** `auth_middleware` on multipart routes so the `data` envelope field is parsed for auth.

### dotenv 17
- v17 prints a startup banner by default → load with `dotenv.config({ quiet: true })` (we don't use the `import 'dotenv/config'` side-effect form because it can't pass options).

### dompurify 3 + jsdom 29
- Server-side: `const window = new JSDOM('').window; const DOMPurify = createDOMPurify(window);`. Used by `sanitizeData` for the request `data` envelope.

### @aws-sdk/client-s3 + s3-request-presigner (Cloudflare R2)
- R2 is S3-compatible: `new S3Client({ region: 'auto', endpoint: R2_ENDPOINT, credentials })`.
- **`getSignedUrl(...)` is offline**: it signs locally with no network call, so presigned upload/playback URLs can be generated (and unit-tested) without contacting R2.
- Upload is direct-to-R2 via a presigned **PUT** (app never proxies bytes). Playback is a short-lived presigned **GET** with `ResponseContentDisposition: inline`. Bucket is private; `storageKey` is never returned to clients.
- The storage service throws `ApiError(503)` when R2 is unconfigured; controllers check `isStorageConfigured()` first so the app still boots without R2 (text lessons work, but video needs R2 since external-URL video isn't supported).

### Encrypted HLS video (ffmpeg + hls.js): anti-download
- On upload-confirm, [services/hls-service.ts](src/services/hls-service.ts) runs **ffprobe** (source height) then **ffmpeg** to produce **adaptive multi-rendition AES-128 encrypted HLS**: variant streams (360/480/720/1080p ≤ source) + a `master.m3u8` via `-var_stream_map`/`-master_pl_name`, encrypted with `-hls_key_info_file`. Uploads all `.m3u8` + `.ts` to R2 under `hls/<assetId>/`, stores the 16-byte key, and **deletes the raw MP4**. Re-encode cost is real; a future optimization is an on-demand worker that spins up per upload and shuts down.
- Playback is **ticket-gated** (short-lived JWT, [services/hls-ticket.ts](src/services/hls-ticket.ts)): the playlist endpoint rewrites the key URI → gated key endpoint and segment names → presigned R2 URLs; the key endpoint returns the raw 16 bytes only with a valid ticket. Network-tab segments are encrypted + key is gated → no single downloadable file.
- **ffmpeg must be on PATH** (added to the Dockerfile, `apk add ffmpeg`). Graceful: no ffmpeg / transcode error → `hlsStatus='failed'` → playback falls back to a presigned MP4.
- **R2 bucket CORS** must allow `PUT` (browser direct-to-R2 uploads) and `GET` (hls.js fetching encrypted segments) from the SPA origin, plus the `content-type` request header. The playlist + AES key are served by the API (not R2), so only segment GETs and uploads are cross-origin to R2.
- Frontend: **hls.js** (lazy-loaded via dynamic `import()` so it stays out of the main bundle) attaches to a `<video>`; native HLS (Safari) is the fallback. The custom player adds resume, progress-save, speed, PiP, fullscreen and keyboard shortcuts.
- Not DRM: within the ticket window a determined enrolled user could still script ffmpeg, and screen-capture defeats any web player. Every lesson video goes through this path, since external video URLs aren't allowed.

### Razorpay (payments): no SDK
- We call the **Orders REST API** directly: `POST https://api.razorpay.com/v1/orders` with
  `Authorization: Basic base64(key_id:key_secret)`. Keeps the dependency surface tiny and the
  exact request/response easy to explain (and audit). Node 24 has global `fetch`.
- **Signature verification uses `crypto`, not the SDK helper**, and is fully explainable:
  - Checkout callback: `HMAC_SHA256(order_id + "|" + payment_id, key_secret)` == `razorpay_signature`.
  - Webhook: `HMAC_SHA256(raw_body, webhook_secret)` == `X-Razorpay-Signature`.
  - Compared with `crypto.timingSafeEqual` (length-guarded) to avoid timing leaks.
- **Money in minor units (paise) as INTEGER** everywhere, no floats. The order amount is
  always read from `course.price` server-side; the client never sends an amount.
- **Webhook needs the raw body**: mount `express.raw()` on the webhook path *before*
  `express.json()` (express.raw sets `req._body` so json skips it). Re-serialized JSON would
  change the bytes and fail the HMAC.
- **Optional like R2**: `isPaymentConfigured()` (key id + secret) gates it; unset → paid
  purchases return 503, free courses still enroll. `getSignedUrl`-style order creation is the
  only path that needs the live gateway, so order *success* can't be unit-tested without test
  keys (signature verification + idempotent fulfillment **are** tested offline by computing a
  valid HMAC).

### express-rate-limit 7
- v7 supports Express 5. Default **in-memory** store, fine for a single instance; for
  horizontal scaling use `rate-limit-redis` backed by the existing ioredis client so counts
  are shared. We deliberately did **not** couple the limiter to Redis, to preserve the
  "Redis is an optional cache" property (a Redis outage shouldn't 500 every limited route).
- Behind a proxy (Render/Railway/etc.) set `app.set('trust proxy', 1)` so `req.ip` is the
  real client. Keep it minimal (`1`, not `true`) because a permissive value lets clients spoof
  `X-Forwarded-For` and evade the limiter (express-rate-limit even validates against this).
- Applied to: payment create-order/verify (`paymentLimiter`), the webhook (`webhookLimiter`,
  a backstop before the HMAC check), and `/user/login` (`authLimiter`, brute-force slowdown).

## Deployment / scaling

- Stateless app. **Postgres + Redis are managed/hosted separately**; provide `DATABASE_URL` (+ `DATABASE_SSL=true`) and `REDIS_URL`. `docker-compose.yml` ships only the `api` service.
- Sequelize TLS for hosted PG: `DATABASE_SSL=true` sets `dialectOptions.ssl = { require: true, rejectUnauthorized: false }` (works with managed providers' certs; supply a CA and flip `rejectUnauthorized` if you need strict verification).
- `sequelize.sync({ alter })` runs only in dev. For production schema changes, move to real migrations before scaling writes.
- Uploads live in R2, not local disk → the container holds no durable state and scales horizontally.
