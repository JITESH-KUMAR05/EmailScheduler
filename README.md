# ReachInbox Email Scheduler

A production-grade bulk email scheduling system built as a fullstack TypeScript application. Schedule thousands of emails in advance, control send rate, and track delivery — all from a clean dashboard.

---

## Why This Was Built

Sending bulk emails is a common need — newsletters, drip campaigns, promotional blasts, onboarding sequences. But doing it naively (looping and sending immediately) causes problems:

- **SMTP servers throttle or ban you** if you send too many emails at once
- **No persistence** — if your server crashes, all pending emails are lost
- **No visibility** — you can't track what was sent, when, or if it failed

This project solves all three:

- A **job queue (BullMQ + Redis)** manages delivery with configurable rate limits
- **PostgreSQL** persists every email record, surviving restarts
- A **Next.js dashboard** shows real-time status of scheduled and sent emails
- A **worker process** runs independently, consuming the queue and sending via SMTP

**Real-world use cases:**
- Marketing teams scheduling campaign blasts for a specific time
- SaaS apps sending onboarding email sequences with delays between each
- Developers testing bulk email flows before connecting a real email provider
- Any system that needs rate-limited, fault-tolerant bulk email delivery

---

## Architecture

```
+----------------------------------------------------------+
|                    Next.js Frontend                      |
|              (Google OAuth + Dashboard)                  |
+---------------------------+------------------------------+
                            | REST API calls
                            v
+----------------------------------------------------------+
|                   Express.js API Server                  |
|              POST /schedule  GET /scheduled              |
+-------------+-----------------------------+--------------+
              |                             |
              v                             v
+---------------------+    +--------------------------------+
|    PostgreSQL DB    |    |     BullMQ Queue (Redis)       |
|  (email records)    |    |  (delayed jobs, persisted)     |
+---------------------+    +--------------+-----------------+
                                          | job fires at scheduled time
                                          v
                           +-----------------------------+
                           |       Email Worker          |
                           |  - checks rate limit        |
                           |  - sends via SMTP           |
                           |  - updates DB status        |
                           +-------------+---------------+
                                         |
                                         v
                           +-----------------------------+
                           |     SMTP (Ethereal / real)  |
                           +-----------------------------+
```

### How a scheduled email flows through the system

1. User submits emails + scheduled time via the dashboard
2. API saves each email to PostgreSQL with status `PENDING`
3. API creates a delayed BullMQ job for each email (delay = `sendAt - now`)
4. At the scheduled time, BullMQ fires the job to the worker
5. Worker checks the per-sender rate limit (PostgreSQL `RateLimit` table)
6. If under limit ? sends via SMTP ? updates status to `SENT`
7. If over limit ? BullMQ retries with exponential backoff
8. Frontend polls every 5 seconds and reflects current status

### Why the worker and server are separate processes

The worker is intentionally a separate Node.js process. This means:
- The API stays fast and non-blocking — it just queues jobs
- The worker can be scaled independently
- If the API restarts, queued jobs in Redis are not lost
- In production both run together via `concurrently`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS 4 |
| Auth | Google OAuth via @react-oauth/google |
| Backend | Express.js 5, TypeScript, Node.js 20+ |
| Queue | BullMQ 5 |
| Database | PostgreSQL 15 |
| ORM | Prisma 5 |
| Cache / Queue store | Redis 7 |
| SMTP | Nodemailer (Ethereal Email for dev) |
| Containerization | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Hosting | Azure App Service (backend) + Azure Static Web Apps (frontend) |

---

## Prerequisites

Before setting up locally, make sure you have:

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Run backend and frontend |
| npm | 9+ | Package manager |
| Docker Desktop | Latest | Run PostgreSQL and Redis locally |
| Git | Any | Clone the repo |

> **Docker Desktop must be running** before you start. PostgreSQL and Redis run as containers — the app will fail to start without them.

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/JITESH-KUMAR05/EmailScheduler.git
cd ReachInboxAssignment
```

### 2. Start Docker Services (PostgreSQL + Redis)

From the **project root** (where `docker-compose.yml` lives):

```bash
docker-compose up -d
```

This spins up:
- **PostgreSQL** on port `5433` (mapped from container's 5432)
- **Redis** on port `6379`

Verify they are running:
```bash
docker ps
```

You should see `reachinbox_db` and `reachinbox_redis` with status `Up`.

To stop containers (data is preserved in Docker volumes):
```bash
docker-compose down
```

To stop and wipe all data:
```bash
docker-compose down -v
```

---

### 3. Backend Setup

```bash
cd server
npm install
```

#### Create the environment file

Create `server/.env` with the following content:

```env
PORT=3000
NODE_ENV=development

# PostgreSQL (matches docker-compose.yml)
DATABASE_URL=postgresql://postgres:password@localhost:5433/reachinbox

# Redis (matches docker-compose.yml)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Rate limiting
MAX_EMAILS_PER_HOUR=200
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS=2

# SMTP — get a free test account at https://ethereal.email/create
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your_ethereal_username@ethereal.email
SMTP_PASS=your_ethereal_password
SMTP_FROM=noreply@reachinbox.com
```

#### Get free SMTP credentials (Ethereal Email)

Ethereal is a fake SMTP service for testing — emails are captured and viewable at `https://ethereal.email/messages`. No real emails are sent.

1. Go to https://ethereal.email/create
2. Click **Create Ethereal Account**
3. Copy the generated `SMTP_USER` and `SMTP_PASS` into your `.env`

#### Initialize the database

```bash
npx prisma db push
```

This creates all tables in PostgreSQL. You only need to run this once, or again if you change `schema.prisma`.

---

### 4. Frontend Setup

```bash
cd ../client
npm install
```

#### Set up Google OAuth

You need a Google OAuth Client ID so users can sign in.

1. Go to https://console.cloud.google.com
2. Create a new project (or select existing)
3. Navigate to **APIs & Services** ? **OAuth consent screen**
   - Choose **External** ? fill App name and your email ? Save
4. Navigate to **APIs & Services** ? **Credentials**
   - Click **+ Create Credentials** ? **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Under **Authorized JavaScript origins** add: `http://localhost:3001`
   - Click **Create** and copy the **Client ID**

#### Create the environment file

Create `client/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id-here
```

---

## Running the Application

You need **three terminals** open for local development.

### Terminal 1 — API Server

```bash
cd server
npm run dev
```

Expected output:
```
Server running on http://localhost:3000
```

### Terminal 2 — Email Worker

```bash
cd server
npm run worker
```

Expected output:
```
Email Worker Started...
Concurrency: 5
Min delay: 2s
Rate limit: 200 emails/hour
Connected to PostgreSQL database
SMTP server is ready to send emails
Waiting for jobs...
```

### Terminal 3 — Frontend

```bash
cd client
npm run dev
```

Expected output:
```
Next.js 16
Local: http://localhost:3001
```

Open http://localhost:3001 in your browser.

### Health check

Verify the backend and Redis are connected:

```
GET http://localhost:3000/health
```

Expected:
```json
{
  "status": "OK",
  "timestamp": "2026-03-04T12:00:00.000Z",
  "redis": "ready"
}
```

---

## Environment Variables Reference

### Backend (`server/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | Environment mode |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password (empty for local Docker) |
| `REDIS_TLS` | `false` | Set `true` for Azure Managed Redis |
| `MAX_EMAILS_PER_HOUR` | `200` | Max emails per sender per hour |
| `WORKER_CONCURRENCY` | `5` | Parallel jobs the worker processes |
| `MIN_DELAY_BETWEEN_EMAILS` | `2` | Seconds between each send |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | From address shown in emails |
| `ALLOWED_ORIGINS` | — | Comma-separated extra CORS origins |

### Frontend (`client/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth Client ID |

---

## API Reference

### `POST /api/emails/schedule`

Schedule a batch of emails.

**Request body:**
```json
{
  "emails": [
    {
      "email": "recipient@example.com",
      "subject": "Hello from ReachInbox",
      "body": "This is the email body."
    }
  ],
  "startTime": "2026-03-05T10:00:00.000Z",
  "delayInSeconds": 5,
  "sender": "default"
}
```

**Response:**
```json
{
  "message": "Emails scheduled successfully",
  "count": 1,
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "startTime": "2026-03-05T10:00:00.000Z"
}
```

---

### `GET /api/emails/scheduled`

Returns all emails with status `PENDING`.

**Response:**
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "subject": "Hello",
    "body": "Test email",
    "status": "PENDING",
    "sendAt": "2026-03-05T10:00:00.000Z",
    "sentAt": null,
    "batchId": "uuid",
    "sender": "default",
    "createdAt": "2026-03-04T12:00:00.000Z"
  }
]
```

---

### `GET /api/emails/sent`

Returns all emails with status `SENT` or `FAILED`.

---

### `GET /health`

Returns server and Redis connection status.

```json
{
  "status": "OK",
  "timestamp": "2026-03-05T10:00:00.000Z",
  "redis": "ready"
}
```

---

## Rate Limiting

Rate limiting is enforced **per sender per hour** using PostgreSQL.

- Each sender gets a row in the `RateLimit` table
- The hour window is formatted as `YYYY-MM-DD-HH`
- Before each send, the worker increments the counter atomically using Prisma `upsert`
- If `emailCount > MAX_EMAILS_PER_HOUR`, the job throws and BullMQ retries with exponential backoff (5s ? 10s ? 20s...)
- When the hour window rolls over, a new row is created and the count resets

To raise the limit, update `MAX_EMAILS_PER_HOUR` in your `.env`.

---

## Common Issues

### Docker containers not running

**Symptom:** `ECONNREFUSED ::1:6379` or `ECONNREFUSED 127.0.0.1:5432`

**Fix:** Open Docker Desktop, then run:
```bash
docker-compose up -d
```

### Database tables missing

**Symptom:** Prisma errors about missing tables on first run

**Fix:**
```bash
cd server
npx prisma db push
```

### Port already in use

**Symptom:** `EADDRINUSE :::3000`

**Fix:** Kill the process using port 3000:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Google OAuth "missing client_id"

**Symptom:** App crashes on load with `Missing required parameter client_id`

**Fix:** Make sure `client/.env.local` has `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set and the dev server was restarted after creating the file.

### Worker not sending emails

**Symptom:** Emails stay `PENDING` past the scheduled time

**Fix:** Make sure Terminal 2 (the worker) is running. The API server alone does not send emails — the worker is a separate process.

---

## Project Structure

```
ReachInboxAssignment/
+-- docker-compose.yml              # PostgreSQL + Redis containers
+-- client/                         # Next.js frontend
¦   +-- app/
¦   ¦   +-- page.tsx                # Login page
¦   ¦   +-- dashboard/
¦   ¦       +-- page.tsx            # Main dashboard (scheduled + sent tabs)
¦   +-- components/
¦   ¦   +-- ComposeModal.tsx        # Email compose + CSV upload modal
¦   +-- context/
¦   ¦   +-- AuthContext.tsx         # Google OAuth auth state
¦   +-- lib/
¦   ¦   +-- api.ts                  # Axios API client
¦   +-- types/
¦       +-- index.ts                # Shared TypeScript types
+-- server/                         # Express.js backend
    +-- prisma/
    ¦   +-- schema.prisma           # Database models
    +-- src/
        +-- server.ts               # Express app + CORS + health check
        +-- config/
        ¦   +-- db.ts               # Prisma client
        ¦   +-- redis.ts            # ioredis connection (TLS-aware)
        +-- controllers/
        ¦   +-- emailController.ts  # Schedule / list endpoints
        +-- routes/
        ¦   +-- apiRoutes.ts        # Route definitions
        +-- worker/
            +-- queue.ts            # BullMQ queue definition
            +-- emailWorker.ts      # Worker: rate limit + SMTP send
```

---

## Deployment (Azure)

The project is configured for automated deployment to Azure via GitHub Actions.

| Resource | Azure Service | URL |
|---|---|---|
| Backend API | App Service (Node 24, Linux, B1) | https://reachinbox-api-d2fqguanfghycrhu.canadacentral-01.azurewebsites.net |
| Frontend | Static Web Apps (Free) | https://zealous-mushroom-0aa6fa00f.1.azurestaticapps.net |
| Database | PostgreSQL Flexible Server | reachinbox-db.postgres.database.azure.com:5432 |
| Redis | Azure Managed Redis | reachinbox-redis.canadacentral.redis.azure.net:10000 |

**CI/CD:** Every push to `main` triggers:
- `.github/workflows/deploy-backend.yml` — builds TypeScript and deploys to App Service
- `.github/workflows/azure-static-web-apps-zealous-mushroom-0aa6fa00f.yml` — builds and deploys frontend

**Required GitHub Secrets:**

| Secret | Description |
|---|---|
| `AZURE_APP_NAME` | App Service resource name |
| `AZURE_PUBLISH_PROFILE` | Downloaded from App Service ? Get publish profile |
| `NEXT_PUBLIC_API_URL` | Backend URL injected at frontend build time |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth Client ID injected at frontend build time |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_*` | Auto-added by Azure when SWA was created |

**Azure-specific env vars to set on App Service:**

```env
NODE_ENV=production
DATABASE_URL=postgresql://...@reachinbox-db.postgres.database.azure.com:5432/reachinbox?sslmode=require
REDIS_HOST=reachinbox-redis.canadacentral.redis.azure.net
REDIS_PORT=10000
REDIS_PASSWORD=<your-redis-access-key>
REDIS_TLS=true
ALLOWED_ORIGINS=https://zealous-mushroom-0aa6fa00f.1.azurestaticapps.net
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=<ethereal-user>
SMTP_PASS=<ethereal-pass>
SMTP_FROM=noreply@reachinbox.com
MAX_EMAILS_PER_HOUR=200
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS=2
```

---

## Author

**Jitesh Kumar**
GitHub: https://github.com/JITESH-KUMAR05
Email: jiteshtechwork@gmail.com
