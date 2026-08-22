# NextLift Workout Tracker — Backend

REST API for the NextLift workout-tracking app: authentication, workouts,
exercises, personal records, and body measurements. Built with NestJS,
PostgreSQL and Prisma.

## Tech Stack

- **Framework**: NestJS 11 (Express platform)
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma 6
- **Auth**: JWT + Passport (local & JWT strategies), refresh tokens in httpOnly cookies
- **Validation**: class-validator + class-transformer (global `ValidationPipe`, `whitelist` + `forbidNonWhitelisted`)
- **Rate limiting**: `@nestjs/throttler` (global) + per-IP demo limits
- **Logging**: Pino (nestjs-pino), with credential redaction
- **Email**: SendGrid (console-mock fallback when `SENDGRID_API_KEY` is unset)
- **API docs**: Swagger at `/api` — enabled in development only
- **Package manager**: pnpm (pinned via `packageManager`; **Node ≥ 22**)

## API shape

- All routes are URI-versioned under **`/v1`** (e.g. `POST /v1/auth/login`), except
  `GET /health`, which is version-neutral.
- Interactive Swagger UI and the raw spec (`/api`, `/api/json`) are served in
  development only; in production they are disabled.

## Quick Start

### Using Docker (recommended)

```bash
# Start Postgres + API + Prisma Studio
docker compose up

# API        -> http://localhost:3000
# Prisma Studio -> http://localhost:5555
```

### Local development

```bash
# Install dependencies (pnpm is pinned; Node >= 22)
pnpm install

# Configure environment
cp .env.example .env

# Apply migrations and seed the system data
npx prisma migrate deploy
npx prisma db seed

# Start the dev server (hot reload)
pnpm start:dev
```

> **pnpm build approvals**: `pnpm-workspace.yaml` lists the dependencies whose
> install scripts are allowed to run (`bcrypt`, `prisma`, `@prisma/client`, …).
> pnpm 10+ blocks build scripts by default, so **do not delete that file** — without
> it `pnpm install` aborts with `ERR_PNPM_IGNORED_BUILDS` and the Docker/CI build fails.

## Scripts

```bash
pnpm start:dev      # dev server with hot reload
pnpm build          # production build (nest build)
pnpm start:prod     # run the built server (node dist/main)

pnpm lint           # eslint --fix
pnpm lint:check     # eslint, no fixes (used in CI)
pnpm typecheck      # tsc --noEmit
pnpm test           # unit tests (jest)
pnpm test:e2e       # e2e tests (needs a running DB + JWT_SECRET)

npx prisma migrate dev   # create + apply a migration
npx prisma generate      # regenerate the Prisma client
npx prisma studio        # open Prisma Studio
npx prisma db seed       # seed system user + exercise library
```

## Project Structure

- `src/auth/` — register, login, refresh, logout, email confirmation, password
  reset, demo sessions (JWT + Passport)
- `src/users/` — account management (deletion)
- `src/workouts/` — workouts, workout-exercises and sets
- `src/exercises/` — exercise library
- `src/body-measurements/` — weight / body-fat / notes tracking
- `src/email/` — SendGrid integration (with console-mock fallback)
- `src/health/` — `/health` and (JWT-guarded) `/health/detailed`
- `src/prisma/` — Prisma service
- `src/config/` — environment validation
- `src/common/` — guards, decorators, constants, shared types
- `prisma/` — schema, migrations and seed

## Features

- JWT authentication with typed access/refresh tokens; refresh tokens are
  httpOnly-cookie-only and hashed at rest, invalidated on logout
- Email confirmation and password reset (enumeration-safe endpoints)
- Workout tracking with exercises, sets and personal records
- Body-measurement tracking
- Seeded exercise library
- Global rate limiting + per-IP demo-session limits + reCAPTCHA on demo login
- Structured logging (Pino) with credential redaction

## Environment Variables

See [`.env.example`](./.env.example). Summary:

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | prod | `production` hardens CORS + cookies and disables Swagger |
| `DATABASE_URL` | always | Postgres connection string |
| `JWT_SECRET` | always | signing secret; app refuses to boot without it |
| `JWT_EXP` | optional | access-token TTL (default `15m`) |
| `JWT_REFRESH_EXP` | optional | refresh-token TTL (default `30d`) |
| `CORS_ORIGIN` | prod | comma-separated allowed origins |
| `FRONTEND_URL` | prod | used to build links in emails |
| `SENDGRID_API_KEY` | optional | console-mock fallback when unset |
| `SENDGRID_VERIFIED_SENDER_EMAIL` | prod | verified sender address |
| `RECAPTCHA_SECRET` | prod | demo-session captcha verification |
| `PORT` | optional | default `3000` |

Startup validation fails fast if a required variable is missing (see
`src/config/env.validation.ts`).

## Deployment (Fly.io)

The app is deployed to Fly.io (app `nextlift-backend`, region `arn`). Pushing to
`main` triggers `.github/workflows/fly-deploy.yml`, which **runs lint, typecheck,
tests and build before deploying**. Config lives in `fly.toml`
(build via `Dockerfile.prod`; `release_command = npx prisma migrate deploy` runs
before each release cuts over).

Manual deploy / operations (requires `flyctl`):

```bash
fly auth login

# Confirm required secrets are set (a missing one now fails boot by design)
fly secrets list -a nextlift-backend
#   NODE_ENV=production, JWT_SECRET, DATABASE_URL, RECAPTCHA_SECRET, SENDGRID_API_KEY
# Set/rotate one:
fly secrets set NODE_ENV=production -a nextlift-backend

# Deploy (builds Dockerfile.prod, runs prisma migrate deploy, then swaps machines)
fly deploy

# Watch
fly logs -a nextlift-backend
#   verify GET /health -> {"status":"ok"} and that /api is no longer served

# Seed on demand (the old fly seed_command was removed):
fly ssh console -a nextlift-backend -C "node prisma/seed.js"

# Rollback
fly releases -a nextlift-backend
fly deploy -a nextlift-backend --image registry.fly.io/nextlift-backend@sha256:<previous>
```

> Migrations are applied by the release command and are not rolled back on a
> revert — keep migrations backward-compatible.

## Testing & CI

- `pnpm test` runs the Jest unit suite (no DB required).
- `pnpm test:e2e` boots the app and needs a live database plus `JWT_SECRET`.
- CI (`fly-deploy.yml`) runs install / prisma generate / lint:check / typecheck /
  test / build / prisma validate on every push to `main`, and only deploys if
  they pass.
