# VeoLMS Backend

Express + TypeScript REST API backed by **PostgreSQL (Sequelize)** and **Redis**. Provides JWT auth and a role-based access-control admin panel (users, roles, menus, permissions).

## Stack

- Node.js 24 · TypeScript · Express 5
- PostgreSQL via Sequelize 6 (`pg`), hosted/managed
- Redis via `ioredis` (caches role permission data for the auth freshness check), hosted/managed
- Cloudflare R2 (S3-compatible) for video/file storage via `@aws-sdk/client-s3` + presigner
- `jsonwebtoken` (auth), `bcryptjs` (password hashing), `multer` (profile-image upload), `dompurify` (sanitization)

## Prerequisites

- Node.js 24+
- PostgreSQL 14+ and Redis 6+ (or use Docker, see below)

## Setup

```bash
cp .env.example .env   # then edit values (set a strong JWT_SECRET)
npm install
```

## Run

```bash
npm run dev        # tsx watch (hot reload)
npm run build      # compile to ./dist
npm start          # run compiled ./dist/app.js
npm run typecheck  # tsc --noEmit
```

On first boot against an **empty** database the app creates the schema
(`sequelize.sync`) and seeds the `Admin` role, the menu tree, and a default admin
user (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, default `admin@veolms.local` / `Admin@123`).
Change these before any non-local use.

## Deploy with Docker

The app is **stateless**: Postgres and Redis are expected to be **managed/hosted
separately**, and uploads go to R2, so [`docker-compose.yml`](docker-compose.yml) ships only the `api`
service. Provide connection URLs via the environment (e.g. an `.env` file next to the
compose file):

```bash
DATABASE_URL=postgres://user:pass@db-host:5432/veolms \
DATABASE_SSL=true \
REDIS_URL=rediss://:pass@redis-host:6379 \
JWT_SECRET=$(openssl rand -hex 32) \
docker compose up --build
```

For local development without managed services, run Postgres + Redis yourself (e.g.
`docker run postgres:17` / `docker run redis:7`) and use `npm run dev`.

## Configuration

All config is via environment variables (validated at startup in
[`src/config/env.ts`](src/config/env.ts)). See [`.env.example`](.env.example) for
the full list: server (`PORT`, `CORS_ORIGIN`), auth (`JWT_SECRET`, `JWT_EXPIRES_IN`),
Postgres (`DATABASE_URL` or discrete `POSTGRES_*`, plus `DATABASE_SSL` for hosted DBs),
Redis (`REDIS_URL`, `REDIS_PERMISSION_TTL`), R2 storage (`R2_ENDPOINT`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PLAYBACK_TTL`),
Razorpay (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`), and
seeding (`SEED_ON_START`, `ADMIN_*`).

## API

Base path: `/api`. All routes except `POST /api/user/login` require a
`Authorization: Bearer <token>` header.

**Access control (admin panel)**

| Resource | Routes |
| --- | --- |
| User | `POST /user/login`, `GET /user/getAllUsers`, `GET /user/getUserById/:id`, `GET /user/getAvatar/:id`, `POST /user/addUser`, `PUT /user/updateUser/:id`, `DELETE /user/deleteUser/:id` |
| Role | `GET /role/getAllRoles`, `GET /role/getRoleById/:id`, `POST /role/addRole`, `PUT /role/updateRole/:id`, `DELETE /role/deleteRole/:id` |
| Menu | `GET /menu/getAllMenus` |
| Permission | `GET /permission/getAllPermissions`, `GET /permission/getPermissionByRole/:id`, `POST /permission/addPermission` |

**LMS** (roles: `Admin`, `Instructor`, `Student`; instructors may only edit their own courses)

| Resource | Routes |
| --- | --- |
| Category | `GET /category/getAllCategories`, `POST /category/addCategory`, `PUT /category/updateCategory/:id`, `DELETE /category/deleteCategory/:id` |
| Course | `GET /course/catalog` (published), `GET /course/my-courses` (instructor), `GET /course/getCourseById/:id`, `POST /course/addCourse`, `PUT /course/updateCourse/:id`, `POST /course/publishCourse/:id`, `POST /course/unpublishCourse/:id`, `DELETE /course/deleteCourse/:id` |
| Section | `GET /section/getByCourse/:courseId`, `POST /section/addSection`, `PUT /section/updateSection/:id`, `DELETE /section/deleteSection/:id` |
| Lesson | `GET /lesson/getLessonById/:id`, `GET /lesson/getPlayback/:id`, `POST /lesson/addLesson`, `PUT /lesson/updateLesson/:id`, `DELETE /lesson/deleteLesson/:id` |
| Enrollment | `POST /enrollment/enroll` (free courses only), `DELETE /enrollment/unenroll/:courseId`, `GET /enrollment/my-courses`, `GET /enrollment/getCourseStudents/:courseId` |
| Progress | `POST /progress/completeLesson`, `POST /progress/updatePosition`, `GET /progress/getCourseProgress/:courseId` |
| Media (R2) | `POST /media/upload-url`, `POST /media/confirm/:id`, `DELETE /media/:id`, `POST /media/cleanup` (Admin) |
| Payment (Razorpay) | `POST /payment/create-order`, `POST /payment/verify`, `POST /payment/webhook` (no JWT, HMAC-signed), `GET /payment/my-payments`, `GET /payment/all` (Admin), `POST /payment/cleanup` (Admin) |

Lessons are `video` or `text` (sanitized HTML). A video lesson's source is always an
R2-hosted upload (`videoAssetId`); external video URLs are not supported (all video is
delivered as private, encrypted HLS, so it can't be downloaded). Publishing
requires at least one lesson; a draft course's content is visible only to its
instructor/Admin; non-preview lessons require enrollment. Completing every lesson
auto-completes the enrollment.

### Payments (Razorpay)

Courses carry a `price` (integer, in **paise**, where ₹1 = 100 and `0` = free) and `currency`
(default `INR`). Purchase flow:

1. `POST /payment/create-order` `{ courseId }`: for a **paid** course the server
   creates a Razorpay order **at the course's price** (never an amount from the client)
   and returns `{ orderId, amount, currency, keyId }`. For a **free** course it enrolls
   immediately and returns `{ free: true, enrolled: true }`.
2. Client opens Razorpay Checkout with `keyId` + `orderId`.
3. `POST /payment/verify` `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`:
   the server recomputes `HMAC_SHA256(order_id|payment_id, key_secret)` and compares it
   (constant-time) to the signature. On a match the payment is marked `paid` and the
   enrollment is granted.
4. `POST /payment/webhook` (server-to-server, **source of truth**): `payment.captured` /
   `order.paid` events are verified against the **raw** body with the webhook secret and
   fulfill the enrollment even if the user closed the tab after paying.

Fulfillment is **idempotent** (the payment row is locked and the enrollment is upserted),
so the callback and webhook firing for the same order grant exactly one enrollment.
`GET /payment/my-payments` is a student's purchase history; `GET /payment/all` (Admin) is
the sales/revenue view.

**Security & robustness:** amounts are always derived server-side from the course price;
every payment is admitted only after HMAC signature verification (callback + raw-body
webhook); the free-enroll endpoint **refuses paid courses (402, fail-closed)** so it can't
bypass payment; `verify` checks the payment belongs to the caller and type-validates its
inputs. A bad-signature attempt can't regress a confirmed `paid` order; fulfillment is
idempotent under concurrent callback+webhook (row lock + savepoint upsert). Already-paid
users are **re-enrolled for free** (no double-charge); paid courses enforce the ₹1 gateway
minimum; the gateway call has a timeout. Payment endpoints, the webhook, and login are
**rate-limited**. If Razorpay env vars are unset, paid purchases return `503` and free
courses still enroll.

### Video / file storage (Cloudflare R2)

Files are stored in a **private** R2 bucket; the DB keeps only the object key (never
returned to clients). Flow:

1. `POST /media/upload-url` (instructor) → short-lived presigned **PUT** URL + `assetId`.
2. Client `PUT`s the file **directly to R2** (the API never proxies bytes).
3. `POST /media/confirm/:id` → marks the asset `ready` and kicks off **encrypted-HLS
   transcoding** in the background; attach it to a lesson via `videoAssetId`.
4. `GET /lesson/getPlayback/:id` (enrollment-gated) → an **encrypted-HLS** stream once
   ready (`{source:'hls'}`), else a short-lived presigned MP4 (`{source:'r2'}`).

**Encrypted, adaptive HLS (anti-download):** on confirm, **ffmpeg** transcodes the video
into **multiple AES-128-encrypted renditions** (360/480/720/1080p ≤ source) + a master
playlist in R2, and the **raw MP4 is deleted**, so there is no single downloadable file.
Playback uses a short-lived **ticket**: the player fetches
`GET /media/hls/:id/playlist?ticket=` (master → gated variant playlists; variant → segment
URLs are short-lived presigned R2 and the key URI points at the gated key endpoint) and
`GET /media/hls/:id/key?ticket=`. In the Network tab the segments are AES-encrypted and
unusable without the ticket-gated key. **hls.js** does adaptive bitrate automatically and
the player offers a **quality selector** (Auto + each rendition). Requires **ffmpeg** in
the image (in the Dockerfile) and an **R2 bucket CORS** rule allowing `PUT` (browser
direct-to-R2 uploads) and `GET` (hls.js fetches segments) from the SPA origin. If ffmpeg is unavailable the
transcode fails gracefully and playback falls back to a presigned MP4.

If R2 env vars are unset, media and video-playback endpoints return `503`; only text
lessons work (there is no external-URL fallback).

**Profile avatars** also live in R2 (`users.avatarAssetId`): `addUser`/`updateUser`
accept a `profileImage` file (multipart, with the JSON body in a `data` field), uploaded
server-side; `getUserById`/`getAvatar` return a short-lived presigned `avatarUrl`.

**Orphan handling:** R2 objects and `media_assets` rows are always deleted together
(reference-checked, so a delete never removes an object another lesson/user still uses).
Deleting a user/lesson/course purges its **unreferenced** objects; replacing an avatar
purges the old one; `DELETE /media/:id` is refused (409) while the asset is still
attached. If an object delete can't complete, the row is kept as `orphaned` rather than
lost. `POST /media/cleanup` (Admin) sweeps abandoned `pending` uploads **and** reclaims
`orphaned` objects (run via cron).

**User management is Admin-gated:** `addUser`/`deleteUser` require the Admin role;
`updateUser` is self-or-admin and non-admins cannot change their own `roleId`.

> **Security note:** uploaded video is delivered as **AES-128 encrypted HLS** with the
> raw file deleted and the key behind a short-lived, enrollment-issued ticket, so there's
> no single downloadable file and the Network-tab segments are encrypted. This is far
> stronger than a signed MP4, but it is **not DRM**: within the ticket window a determined
> enrolled user could still script ffmpeg, and screen-capture defeats any web player. Full
> stop requires DRM (Widevine/FairPlay). Because external video URLs aren't allowed, every
> lesson video goes through this protected path.

On a fresh (empty) database the seeder also creates demo logins (dev only; change
for production) and a demo catalog of **4 published courses** (JavaScript, React, Node,
and a **free** CSS course), each with 2 sections, 5 video/text lessons, and a free
preview. Video lessons are seeded **without a source** (video is upload-only); upload your
own clips to them from the admin panel and they start playing.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@veolms.local` | `Admin@123` |
| Instructor | `instructor@veolms.local` | `Instructor@123` |
| Student | `student@veolms.local` | `Student@123` |

List endpoints accept a `data` JSON query param: `{ search, sorting, dataLimit, pagination }`
(search/sort fields are validated against the model). Login returns a JWT plus the
role's permission map; changing a role's permissions bumps its version and
invalidates the Redis cache, forcing affected tokens to re-login.

## Project layout

```
src/
  app.ts                  # bootstrap: db + redis connect, middleware, server, graceful shutdown
  routes.ts               # /api router
  config/env.ts           # validated environment config
  db/                     # sequelize instance, redis client, associations, connection, seeders
  middleware/             # auth, id-validator, central error handler
  services/               # permission cache, multer, sanitize
  helpers/                # async-handler, query filters, permission mapper
  routes/control/<entity> # admin panel: <entity>-api (routes) · -controller · -model
  routes/lms/<entity>     # LMS domain: category, course, section, lesson, enrollment, progress
  types/                  # shared interfaces + Express request augmentation
```
