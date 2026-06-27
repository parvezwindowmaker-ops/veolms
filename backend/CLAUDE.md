# VeoLMS Backend: context for Claude

Express + TypeScript REST API. **Stack is locked: PostgreSQL + Sequelize + Redis. No MongoDB/Mongoose anywhere.** (This backend was migrated off Mongoose; do not reintroduce it.)

## Commands

```bash
npm run dev        # tsx watch src/app.ts (hot reload)
npm run build      # tsc -> dist/
npm start          # node dist/app.js
npm run typecheck  # tsc --noEmit
docker compose up --build   # full stack (postgres + redis + api)
```
Local run needs Postgres + Redis. Smoke-testing locally: `docker run` throwaway `postgres:17` + `redis:latest` on alt ports and point the app at them with `POSTGRES_PORT=...`/`REDIS_URL=...` (these override `.env`; dotenv does not clobber existing env vars).

## Architecture & conventions

- **Entity triad** per resource under `src/routes/control/<entity>/`: `<entity>-api.ts` (routes), `-controller.ts` (handlers), `-model.ts` (Sequelize model). Resources: user, role, menu, permission (RBAC admin panel).
- **Controllers throw `ApiError(status, msg)`** and are wrapped in `asyncHandler` in the route files. A central `errorHandler` ([middleware/error-middleware.ts](src/middleware/error-middleware.ts)) maps `ApiError` + Sequelize errors (Unique→409, Validation→400, FK→409) to responses. Do not write per-handler try/catch.
- **Auth**: `auth_middleware` verifies the JWT and checks a Redis-cached **role permission version**; if the role's `lastPermissionUpdate` is newer than the token's, it returns 403 (re-login). Changing permissions calls `invalidateRolePermissions(roleId)`. Redis is only a cache, so it degrades to Postgres if down.
- **Config** is centralized + validated in [config/env.ts](src/config/env.ts) (`env.*`). Never read `process.env` directly elsewhere; never hardcode secrets. Add new vars there + in [env.d.ts](env.d.ts) + [.env.example](.env.example).
- **IDs are BIGSERIAL integers** (not UUIDs). `id_checker_middleware` validates `^\d+$`.
- **Schema** is created via `sequelize.sync({ alter: !production })` in [db/connection.ts](src/db/connection.ts); seeding is idempotent (only when DB empty). No migrations yet.

## LMS module (`src/routes/lms/`)

Instructor-led catalog. Same entity-triad convention as the admin panel. Domain:
`Category → Course → Section → Lesson (video|text)`, plus `Enrollment` and `LessonProgress`.

- **Roles**: `Admin`, `Instructor`, `Student` (seeded). Domain authorization uses
  `requireRole(...)` ([middleware/role-middleware.ts](src/middleware/role-middleware.ts)) on `req.user.roleName`, plus
  **ownership**: instructors may only modify their own courses, which
  `loadOwnedCourse(courseId, req.user)` enforces ([routes/lms/course-access.ts](src/routes/lms/course-access.ts)), used by the course,
  section, and lesson controllers. `isAdminOrOwner(user, ownerId)` is the predicate.
- **Visibility gating** (important, easy to forget on new read endpoints): a `draft`
  course's content is visible only to its instructor/Admin. Any endpoint returning
  course/section/lesson content for non-owners MUST check `status === 'published'`
  (see `getCourseById`, `getSectionsByCourse`, `getLessonById`). Non-preview lessons
  additionally require enrollment.
- **Validate body ids/ints** with [helpers/parse-id.ts](src/helpers/parse-id.ts) (`bodyId`, `nonNegInt`) before they
  reach Sequelize. `id_checker_middleware` only guards `:id` route params, not body
  fields, and a non-numeric value on a BIGINT/INT column is a 500 otherwise.
- **Progress**: `LessonProgress` is upserted race-safely (catch unique violation →
  re-fetch). `unenroll` deletes the user's progress for the course in a transaction.
  Completion % is always computed live from lesson/progress counts.
- Routers mounted in [routes.ts](src/routes.ts): `/category /course /section /lesson /enrollment /progress /media /payment`.
- Demo logins (seeded, dev only): `instructor@veolms.local` / `Instructor@123`,
  `student@veolms.local` / `Student@123`. A demo catalog (4 published courses incl. a free
  one, each 2 sections × 5 lessons, placeholder YouTube videos) is seeded too.
- **Scope** (per the build challenge): payments → frontend → deploy. **No assessments/
  quizzes**: explicitly out of scope; do not build them.

## Media & video storage (Cloudflare R2)

- Files live in **Cloudflare R2** (S3-compatible), accessed via [services/storage-service.ts](src/services/storage-service.ts)
  (`@aws-sdk/client-s3` + presigner). The **bucket is private**; the DB stores only
  the object **key** (`media_assets.storageKey`), which is **never serialized to clients**.
- **Upload** is direct-to-R2 (the app never proxies bytes): `POST /media/upload-url`
  (instructor) returns a short-lived presigned **PUT**; client uploads, then
  `POST /media/confirm/:id` HEADs the object and marks the `MediaAsset` `ready`.
- A video **Lesson** is either external (`videoUrl`) **or** R2 (`videoAssetId` →
  `media_assets`), never both (enforced in `resolveVideoFields`).
- **Secure playback**: `GET /lesson/getPlayback/:id` is gated by `assertLessonAccess`
  (owner/admin, or published + preview/enrolled) and returns one of:
  `{source:'hls'}` (preferred; encrypted HLS, see below), `{source:'r2'}` (short-lived
  presigned MP4 that falls back before transcode finishes / if ffmpeg absent), or
  `{source:'external'}` (the YouTube URL).
- **Encrypted HLS (anti-download) + ABR**, [services/hls-service.ts](src/services/hls-service.ts): after `confirmUpload`, a
  background `transcodeToHls(assetId)` uses **ffmpeg** (height probed via **ffprobe**) to
  produce an **adaptive multi-rendition** (360/480/720/1080 ≤ source) **AES-128-encrypted**
  HLS (variant playlists + a `master.m3u8`, all under `hls/<assetId>/` in R2), stores the 16-byte key
  on the asset (`hlsKeyB64`, **never serialized**), then **deletes the raw MP4** so no single
  downloadable file remains. Playback: `getPlayback` issues a short-lived **ticket**
  ([services/hls-ticket.ts](src/services/hls-ticket.ts), 2h); the player hits
  `GET /media/hls/:id/playlist?ticket=&p=<name>.m3u8` (master → variant URIs routed back
  through this gated endpoint; variant → key URI rewritten to the gated key endpoint and
  segment names → short-lived presigned R2 URLs; `p` is whitelisted `^[\w.-]+\.m3u8$` to
  block traversal) and `GET /media/hls/:id/key?ticket=`. hls.js does ABR automatically and
  the player exposes a quality picker (Auto + each rendition).
  Segments in the Network tab are AES-encrypted and useless without the **ticket-gated**
  key. Residual: within the ticket window an enrolled user could still script ffmpeg, and
  screen-capture always works, and true DRM (Widevine/FairPlay) is the only full stop.
  **ffmpeg must be on PATH** (added to the Dockerfile); transcode is graceful (failure →
  `hlsStatus='failed'` → MP4 fallback). **R2 bucket CORS must allow GET** from the
  frontend origin (hls.js fetches segments cross-origin).
- R2 is **optional**: if unconfigured (`env.r2.configured === false`), media endpoints
  return **503** and external-URL lessons still work. Don't assume R2 is present.
- **Profile avatars** also live in R2 (`users.avatarAssetId` → `media_assets`, kind
  `image`). They're small, so they upload **server-side** through `putObject` (multer
  `memoryStorage`, no local disk) rather than presigned PUT. `getUserById`/`getAvatar`
  return a short-lived presigned `avatarUrl`; the storageKey is never returned. There is
  no `pic` column anymore and no `/api/public` static route.

## Media lifecycle: avoiding orphans (important)

R2 objects and `media_assets` rows must be deleted together. **Always go through
[services/media-service.ts](src/services/media-service.ts)** (`purgeAsset` / `purgeAssetsByIds`), which deletes the R2
object (best-effort, skipped if R2 is off) **then** the row.

- FK cascade deletes asset **rows** but NOT R2 objects, so delete paths capture asset
  ids and purge objects explicitly: `deleteUser` (avatar + the user's uploads),
  `deleteLesson` (its video), `deleteCourse` (all its lessons' videos, collected
  before the cascade).
- `updateUser` replacing an avatar purges the **old** asset after a successful save;
  on failure the **new** asset is rolled back. `addUser` rolls back the avatar if the
  user row fails to create.
- `DELETE /media/:id` refuses (409) if the asset is still referenced by a lesson or
  avatar (`assetReferenceCount`); detach first.
- When an object delete can't complete (R2 down/unconfigured, or a delete error),
  `purgeAsset` **keeps the row and marks it `status:'orphaned'`** (never silently drops a
  row whose object still exists). `purgeAssetsByIds` is fault-tolerant (one failure
  doesn't abort the batch).
- `POST /media/cleanup` (Admin) does two sweeps: `cleanupStalePending(hours)` (abandoned
  `pending` uploads) and `reclaimOrphanedAssets()` (retry-delete `orphaned` objects, drop
  the row on success). Run it on a cron.
- Residual untracked case: a presigned video PUT that lands but is never confirmed leaves
  an R2 object the DB doesn't track, so backstop with an **R2 lifecycle rule** on the
  `videos/` prefix.

## Payments (Razorpay), `src/routes/lms/payment/`

- A `Course` has `price` (INTEGER, **paise**, 0 = free) + `currency` (default `INR`).
  Money is stored in **minor units** end-to-end (no floats); the frontend converts ₹↔paise.
- [services/payment-service.ts](src/services/payment-service.ts): order creation via the Razorpay **Orders REST API**
  (`fetch` + Basic auth, no SDK dependency) and **HMAC-SHA256** signature verification
  with Node `crypto` (constant-time compare). `isPaymentConfigured()` gates on key id +
  secret; like R2 it's **optional** (paid purchases → 503 when unset, free still works).
- Flow: `POST /payment/create-order` (server derives amount from `course.price`, **never**
  from the client) → client Checkout → `POST /payment/verify` (callback signature) and/or
  `POST /payment/webhook` (raw-body `X-Razorpay-Signature`, the source of truth).
- **Fulfillment is idempotent**: `fulfillPayment()` ([payment-controller.ts](src/routes/lms/payment/payment-controller.ts)) locks the
  payment row (`LOCK.UPDATE`) and **upserts** the enrollment (unique `userId+courseId`), so
  the verify callback and the webhook firing for one order grant exactly one enrollment.
- **Payment-bypass guard (don't regress)**: `POST /enrollment/enroll` **refuses paid
  courses (402)**: it's for free self-enroll only, and it fails **closed** via
  `isFreeCourse(price)` ([course-pricing.ts](src/routes/lms/course/course-pricing.ts), "free" === price exactly 0). Paid access is
  granted *only* through a verified payment. `verify` also checks the payment belongs to
  `req.user`, and **type-validates** the `razorpay_*` fields (string + length) before they
  reach the DB/HMAC (untyped JSON would otherwise 500 or build a bad `where`).
- **Webhook raw body**: [app.ts](src/app.ts) mounts `express.raw({ type: '*/*', limit:'16kb' })`
  on `/api/payment/webhook` **before** `express.json()` (express.raw sets `req._body`, so the
  JSON parser skips it). The handler **requires** `req.body` to be a Buffer (fail loud on a
  misconfig) and HMACs the exact raw bytes, never re-serialized JSON.
- **Entitlement is perpetual**: `create-order` re-grants enrollment for free if a `paid`
  Payment already exists for `(user, course)`, so unenroll→re-enroll never double-charges. It
  also **reuses an open `created` order** at the current price instead of spawning a new one.
- **State-machine integrity**: a bad-signature `verify` uses a conditional UPDATE
  (`WHERE status='created'`) so it can never regress a webhook-confirmed `paid` row to
  `failed`. The enrollment upsert in `fulfillPayment` runs in a **SAVEPOINT** so a concurrent
  cross-order insert surfaces as a `UniqueConstraintError` we treat as success (no poisoned txn).
- **Pricing**: paid courses must be ≥ `MIN_PAID_PRICE` (100 paise / ₹1, the Razorpay floor),
  enforced by `validateCoursePrice` in `addCourse`/`updateCourse`. `createOrder` has a 10s
  `AbortSignal.timeout` so a stalled gateway can't pin a request + DB slot open.
- **Rate limiting** ([rate-limit-middleware.ts](src/middleware/rate-limit-middleware.ts), `express-rate-limit`, in-memory): `paymentLimiter`
  on create-order/verify, `webhookLimiter` on the webhook, `authLimiter` on `/user/login`.
  `app.set('trust proxy', 1)` makes `req.ip` correct behind one proxy (swap in a Redis store
  for multi-instance). `POST /payment/cleanup` (Admin/cron) expires stale `created` orders.
- `Payment` rows are an audit trail (`created` → `paid`/`failed`). Associations CASCADE on
  user/course delete (mirrors enrollment); production would soft-delete to preserve them.

## User-management authorization (don't regress)

- `POST /user/addUser` and `DELETE /user/deleteUser/:id` are **Admin-only** (`requireRole('Admin')`).
- `PUT /user/updateUser/:id` is **self-or-admin**: the controller rejects editing another
  user unless Admin, and **strips `roleId` for non-admins** (no self-escalation).
- `MediaAsset.uploadedById` is `SET NULL` on user delete (don't switch to CASCADE, since it
  would drop assets still attached to live courses). `deleteUser` purges only the user's
  avatar + their **unreferenced** uploads (reference-checked), destroy-first.
- Multer upload errors (size/field) are mapped to 413/400 by the central error handler
  (`MulterError` branch), not 500.

## Deployment / scaling

- **Stateless app**; Postgres + Redis are **managed/hosted separately**. The app takes
  `DATABASE_URL` (+ `DATABASE_SSL=true` for TLS) and `REDIS_URL`; see [config/env.ts](src/config/env.ts).
  [docker-compose.yml](docker-compose.yml) ships **only the `api` service** (no bundled db/redis).
- Uploads go to R2, not local disk, so the container has no durable local state (safe to
  scale horizontally / run read replicas of the API).

## Non-obvious gotchas (verified)

- **`pg.defaults.parseInt8 = true`** in [db/sequelize.ts](src/db/sequelize.ts) so BIGINT returns JS `number`, not string. Required for `JwtPayload.id: number` and the typeof checks in auth.
- **Password**: `User` has a `defaultScope` excluding `password`; use `User.unscoped()` when you need it (login). The `beforeSave` hook hashes only when `user.changed('password')`, so **update via `instance.set(...)` + `instance.save()`**, not `Model.update`, or the hook won't run.
- **Permission flags**: model columns are `canCreate/canRead/canUpdate/canDelete` (avoids the `update` instance-method collision + SQL reserved words). The HTTP layer maps to/from `create/read/update/delete` via [helpers/permission-mapper.ts](src/helpers/permission-mapper.ts).
- **Sequelize TS**: models use `InferAttributes`/`CreationOptional`/`ForeignKey`; association props are `NonAttribute<...>`.
- **List endpoints** take a `data` JSON query param (`{search, sorting, dataLimit, pagination}`). `parseRequestParams(req, Model)` whitelists search/sort fields against the model's columns (text-only for search, `password` blocked); unknown fields are ignored, never 500.
- **Express 5**: rejected promises auto-forward to the error handler (asyncHandler is redundant but kept); `req.body` is `undefined` (not `{}`) when unparsed, so always use `req.body ?? {}`.
- **@types/node must track the Node major we run (24).** Don't bump it past the runtime.

See [docs/STACK.md](docs/STACK.md) for the full version table and per-package notes, and [README.md](README.md) for setup/API.
