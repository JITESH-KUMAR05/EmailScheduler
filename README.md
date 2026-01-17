# 🚀 ReachInbox Email Scheduler

Production-grade email scheduling system built with TypeScript, Express.js, BullMQ, PostgreSQL, Redis, and Next.js.

## 📋 Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Setup Instructions](#setup-instructions)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Rate Limiting & Concurrency](#rate-limiting--concurrency)
- [Deployment](#deployment)

---

## ✨ Features

### Backend
- ✅ Email scheduling via REST API
- ✅ BullMQ job queue with Redis persistence
- ✅ PostgreSQL database for email storage
- ✅ Ethereal Email SMTP integration
- ✅ Configurable rate limiting (200 emails/hour default)
- ✅ Worker concurrency (5 workers default)
- ✅ Minimum 2-second delay between emails
- ✅ Survives server restarts without data loss
- ✅ Idempotent job processing

### Frontend
- ✅ Google OAuth authentication
- ✅ Email composition with CSV upload
- ✅ Scheduled emails dashboard
- ✅ Sent emails history
- ✅ Real-time status updates (polls every 5 seconds)
- ✅ Responsive design with Tailwind CSS

---

## 🏗 Architecture

### System Overview
```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Next.js   │─────▶│  Express.js │─────▶│  PostgreSQL │
│  Frontend   │      │   API       │      │  Database   │
└─────────────┘      └─────────────┘      └─────────────┘
                            │                     │
                            ▼                     │
                     ┌─────────────┐             │
                     │   BullMQ    │◀────────────┘
                     │   Queue     │
                     └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │    Redis    │
                     │  (Persist)  │
                     └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │   Worker    │
                     │  (Sends)    │
                     └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │  Ethereal   │
                     │    SMTP     │
                     └─────────────┘
```

### How Scheduling Works
1. **API receives request** → Validates data
2. **Emails saved to PostgreSQL** with `PENDING` status
3. **BullMQ creates delayed jobs** for each email
4. **Worker processes jobs** at scheduled time
5. **Rate limiting checked** before sending
6. **Email sent via SMTP** → Status updated to `SENT`
7. **Database updated** with `sentAt` timestamp

### Persistence After Restart
- **PostgreSQL**: Stores all email records with status
- **Redis**: BullMQ persists pending jobs
- **On restart**: Worker reconnects to Redis and processes remaining jobs

### Rate Limiting Implementation
- **Database-backed counters** (PostgreSQL `RateLimit` table)
- **Unique constraint** on `sender + hourWindow`
- **Atomic increment** using Prisma `upsert`
- **Safe across multiple workers** (no race conditions)
- **When limit exceeded**: Job throws error → BullMQ retries with exponential backoff
- **Configuration**: `MAX_EMAILS_PER_HOUR=200` in `.env`

### Concurrency & Throttling
- **Worker concurrency**: `WORKER_CONCURRENCY=5` (5 emails processed in parallel)
- **Min delay between sends**: `MIN_DELAY_BETWEEN_EMAILS=2` (2 seconds)
- **BullMQ limiter**: Max 200 jobs per hour per queue
- **Custom delay**: Added in worker logic to mimic SMTP throttling

---

## 🛠 Tech Stack

### Backend
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express.js 5
- **Queue**: BullMQ 5
- **Database**: PostgreSQL 15 (via Docker)
- **ORM**: Prisma 5
- **Cache/Queue Store**: Redis 7 (via Docker)
- **SMTP**: Nodemailer with Ethereal Email

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Auth**: Google OAuth (@react-oauth/google)
- **HTTP Client**: Axios
- **Icons**: Lucide React

---

## 📦 Setup Instructions

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (for PostgreSQL & Redis)
- Google Cloud Project (for OAuth)

### 1. Clone Repository
```bash
git clone https://github.com/JITESH-KUMAR05/EmailScheduler.git
cd ReachInboxAssignment
```

### 2. Setup Backend

#### Install Dependencies
```bash
cd server
npm install
```

#### Setup Ethereal Email
1. Go to https://ethereal.email/create
2. Click "Create Ethereal Account"
3. Copy the credentials

#### Configure Environment
Create `server/.env`:
```env
PORT=3000
NODE_ENV=development

DATABASE_URL=postgresql://postgres:password@localhost:5433/reachinbox

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

MAX_EMAILS_PER_HOUR=200
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS=2

SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your_ethereal_email@ethereal.email
SMTP_PASS=your_ethereal_password
SMTP_FROM=noreply@reachinbox.com
```

#### Start Database & Redis
```bash
# From project root
docker-compose up -d
```

#### Run Database Migrations
```bash
cd server
npx prisma db push
npx prisma generate
```

### 3. Setup Frontend

#### Install Dependencies
```bash
cd ../client
npm install
```

#### Setup Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable Google+ API
3. Create OAuth 2.0 Client ID
4. Add authorized origins: `http://localhost:3001`
5. Copy Client ID

#### Configure Environment
Create `client/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## 🚀 Running the Application

### Start Backend Services

#### Terminal 1: API Server
```bash
cd server
npm run dev
```
**Expected output:**
```
🚀 Server running on http://localhost:3000
✅ Email queue initialized
Connected to Redis
```

#### Terminal 2: Worker
```bash
cd server
npm run worker
```
**Expected output:**
```
🚀 Email Worker Started...
⚙️ Concurrency: 5
⏱️ Min delay: 2s
📊 Rate limit: 200 emails/hour
✅ Connected to PostgreSQL database
✅ SMTP server is ready to send emails
📬 Waiting for jobs...
```

### Start Frontend

#### Terminal 3: Next.js Dev Server
```bash
cd client
npm run dev
```
**Expected output:**
```
▲ Next.js 14.0.0
- Local: http://localhost:3001
```

---

## 🌐 API Documentation

### POST /api/emails/schedule
Schedule a batch of emails

**Request Body:**
```json
{
  "emails": [
    {
      "email": "user@example.com",
      "subject": "Hello",
      "body": "Test email"
    }
  ],
  "startTime": "2026-01-18T10:00:00.000Z",
  "delayInSeconds": 5,
  "sender": "default"
}
```

**Response:**
```json
{
  "message": "Emails scheduled successfully",
  "count": 1,
  "batchId": "uuid-here",
  "startTime": "2026-01-18T10:00:00.000Z"
}
```

### GET /api/emails/scheduled
Get all pending emails

**Response:**
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "subject": "Hello",
    "body": "Test email",
    "status": "PENDING",
    "sendAt": "2026-01-18T10:00:00.000Z",
    "sentAt": null,
    "batchId": "uuid",
    "sender": "default",
    "createdAt": "2026-01-17T12:00:00.000Z",
    "updatedAt": "2026-01-17T12:00:00.000Z"
  }
]
```

### GET /api/emails/sent
Get all sent/failed emails

**Response:**
```json
[
  {
    "id": 1,
    "status": "SENT",
    "sentAt": "2026-01-18T10:00:05.000Z",
    ...
  }
]
```

---

## ⚙️ Rate Limiting & Concurrency

### Configuration
All limits are configurable via environment variables:

```env
MAX_EMAILS_PER_HOUR=200          # Max emails per hour per sender
WORKER_CONCURRENCY=5             # Parallel jobs processed
MIN_DELAY_BETWEEN_EMAILS=2       # Seconds between each send
```

### How It Works
1. **Database Counter**: Each sender gets a row in `RateLimit` table
2. **Hour Window**: Format `YYYY-MM-DD-HH` (e.g., `2026-01-17-14`)
3. **Atomic Increment**: Prisma `upsert` with `emailCount: { increment: 1 }`
4. **Check Before Send**: If `emailCount > MAX_EMAILS_PER_HOUR`, job fails with retry
5. **Backoff**: BullMQ retries with exponential backoff (5s, 10s, 20s...)

### Behavior Under Load
- **1000 emails scheduled** → BullMQ queues all with delays
- **Rate limit hit** → Jobs delayed to next hour window
- **Order preserved** → FIFO processing with delays
- **No data loss** → All jobs persist in Redis

---



## 📝 Assumptions & Trade-offs

### Assumptions
- Single timezone (UTC) for all scheduling
- CSV format: one email per line
- Max 1000 emails per batch (not enforced, but recommended)

### Trade-offs
- **Polling interval**: Frontend polls every 5 seconds (could use WebSockets for real-time)
- **Rate limiting**: Per-sender (could extend to per-domain)
- **Error handling**: Basic retry logic (could add dead-letter queue)
- **Attachments**: Not implemented (focused on core features)

---


## 👨‍💻 Author

**Jitesh Kumar**
- GitHub: https://github.com/JITESH-KUMAR05/
- Email: jiteshtechwork@gmail.com

---
