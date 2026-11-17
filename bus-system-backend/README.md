# Bus Trip & Seat Booking Backend (`bus-system-backend`)

Backend REST API for the inter-governorate bus trip & seat booking system, built with **NestJS**, **TypeScript (ESM)**, **PostgreSQL + Prisma ORM**, **Redis**, **JWT + RBAC**, **Swagger/OpenAPI**, and **NestJS Scheduler**.

---

## Key Features
- **Unified REST API (`/api/v1`)** serving both the Next.js Web Admin/Receptionist Dashboard (`ADMIN_WEB`) and the React Native Mobile App (`MOBILE`).
- **Authentication & RBAC**:
  - Staff (`ADMIN`, `RECEPTIONIST`) username/email + Argon2 password login, 5-attempt / 15-minute account lockout, forced password change on initial creation or admin reset, and immediate session invalidation upon deactivation.
  - Customer phone + 6-digit OTP via Redis (5-minute TTL, max 3 verification attempts, 60-second resend cooldown, hourly rate limit) plus optional guest booking flow.
  - Short-lived Access JWT (15m) + revocable rotated Refresh Tokens (7d).
- **Master Data & Dynamic Seat Maps**:
  - Cities (Arabic + optional English, deletion protection when linked to trips).
  - Pre-seeded 6 bus types (`45`, `37`, `33`, `27`, `22`, `18` seats) with automatic `seat_templates` generation and support for adding custom bus types without code changes.
  - Physical buses with unique plate numbers.
- **Trips & Recurring Templates**:
  - UTC timestamp storage with `Asia/Damascus` date/time conversion and Syrian month formatting.
  - Recurring templates (`DAILY`, `WEEKLY`, `MONTHLY` with month-end clamping), holiday exclusions, preview, `ON CONFLICT DO NOTHING` trip generation (`UNIQUE(template_id, depart_at)`), and edits isolated to future unbooked trips.
- **Seat Locking & Double-Booking Prevention**:
  - Redis `SET NX EX` temporary seat locks (`lock:trip:{id}:seat:{no}`).
  - Single-transaction booking confirmation (`FOR UPDATE` + PostgreSQL partial unique index `UNIQUE(trip_id, seat_number) WHERE is_active = true`), `Idempotency-Key` support, and `BK-YYYYMMDD-NNNN` booking codes.
  - Policy-enforced full and partial single-seat cancellation with Admin deadline override and immediate seat release.
- **Tickets, Notifications, Reports, Audit Logs & Scheduler**:
  - Digital tickets with HMAC-signed QR payloads.
  - FCM HTTP v1 push notifications + configurable SMS provider (`TBD-5`) with SMS fallback on trip cancellation.
  - Admin dashboard KPIs and occupancy/revenue/top-routes/staff reports (JSON/CSV/PDF).
  - Immutable `audit_logs` and dynamic `settings`.
  - Redis-locked idempotent cron jobs (`02:00` trip generation, 1-minute status/reminder sync, 5-minute lock sweep, `03:00` encrypted database backup).

---

## Prerequisites
- **Node.js** `>= 24.0`
- **PostgreSQL** (any currently supported version)
- **Redis** (for seat holds, OTP, rate limiting, and distributed scheduler locks)

> Note: Automated integration and E2E tests (`npm run test:e2e`) can run either against external `TEST_DATABASE_URL` / `TEST_REDIS_URL` instances or automatically spin up isolated local `embedded-postgres` + `redis-server` processes when available.

---

## Setup & Configuration

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   Copy `.env.example` to `.env` and fill in your PostgreSQL, Redis, and secret values:
   ```bash
   cp .env.example .env
   ```

3. **Generate Prisma Client & Apply Migrations**
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

4. **Run Database Seed**
   Seeds default policy `settings`, 8 Syrian cities, the 6 standard bus types with generated `seat_templates`, and the initial `ADMIN` account (`ADMIN_SEED_*`):
   ```bash
   npx prisma db seed
   ```

---

## Running the Application

```bash
# Development (watch mode)
npm run start:dev

# Production build & start
npm run build
npm run start:prod
```

- **API Base URL**: `http://localhost:3000/api/v1`
- **Health Check**: `GET http://localhost:3000/api/v1/health`
- **Swagger / OpenAPI UI**: `http://localhost:3000/api/docs`
- **OpenAPI JSON**: `http://localhost:3000/api/docs-json`

---

## Testing & Verification

```bash
# Unit tests
npm run test

# Unit tests with V8 coverage
npm run test:cov

# Integration, E2E, RBAC, 100-concurrent-booking, cancellation, and scheduler tests
npm run test:e2e

# Linting (oxlint type-aware)
npm run lint

# Production build check
npm run build
```

---

## Architecture Notes
- Generated via NestJS CLI (`nest g resource modules/<name>`), structured under `src/modules/` with strict separation of Controllers, Services, DTOs, and Prisma/Redis data layers.
- ESM (`"type": "module"`) throughout (`import`/`export` only, `.js` relative import extensions).
- Unified error contract across all endpoints:
  ```json
  {
    "code": "SEAT_ALREADY_BOOKED",
    "message": "...",
    "details": {}
  }
  ```
