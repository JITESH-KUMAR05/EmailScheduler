import { prisma } from '../config/db';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// ─── SMTP transporter ────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error('❌ SMTP connection failed:', error);
  } else {
    console.log('✅ SMTP server is ready to send emails');
  }
});

// ─── Rate limiting (DB-backed) ────────────────────────────────────────────────

async function checkRateLimit(sender: string): Promise<boolean> {
  const now = new Date();
  const hourWindow = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}`;
  const maxPerHour = Number(process.env.MAX_EMAILS_PER_HOUR) || 200;

  const record = await prisma.rateLimit.upsert({
    where: { sender_hourWindow: { sender, hourWindow } },
    create: { sender, hourWindow, emailCount: 1 },
    update: { emailCount: { increment: 1 } },
  });

  return record.emailCount <= maxPerHour;
}

// ─── Core send function ───────────────────────────────────────────────────────

async function sendEmailRecord(emailRecord: {
  id: number;
  email: string;
  subject: string;
  body: string;
  sender: string;
}): Promise<void> {
  console.log(`📧 Sending email ${emailRecord.id} → ${emailRecord.email}`);

  const canSend = await checkRateLimit(emailRecord.sender);
  if (!canSend) {
    console.warn(`⏸️ Rate limit reached for sender "${emailRecord.sender}", resetting email ${emailRecord.id} to PENDING`);
    await prisma.scheduledEmail.update({
      where: { id: emailRecord.id },
      data: { status: 'PENDING' },
    });
    return;
  }

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: emailRecord.email,
    subject: emailRecord.subject,
    text: emailRecord.body,
    html: `<p>${emailRecord.body}</p>`,
  });

  console.log(`✅ Email ${emailRecord.id} sent — messageId: ${info.messageId}`);
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`🔗 Preview: ${previewUrl}`);
  }

  await prisma.scheduledEmail.update({
    where: { id: emailRecord.id },
    data: { status: 'SENT', sentAt: new Date() },
  });

  console.log(`📊 DB updated: email ${emailRecord.id} → SENT`);
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

let processing = false;

async function processDueEmails(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    const now = new Date();

    const due = await prisma.scheduledEmail.findMany({
      where: { status: 'PENDING', sendAt: { lte: now } },
      orderBy: { sendAt: 'asc' },
      take: 10,
    });

    if (due.length === 0) {
      processing = false;
      return;
    }

    console.log(`⏰ Poll: ${due.length} email(s) due for sending`);

    // Mark as PROCESSING to prevent double-send on concurrent restarts
    await prisma.scheduledEmail.updateMany({
      where: { id: { in: due.map(e => e.id) }, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });

    const minDelay = Number(process.env.MIN_DELAY_BETWEEN_EMAILS) || 2;

    for (const emailRecord of due) {
      try {
        await sendEmailRecord(emailRecord);
        if (minDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, minDelay * 1000));
        }
      } catch (err) {
        console.error(`❌ Failed to send email ${emailRecord.id}:`, err);
        await prisma.scheduledEmail.update({
          where: { id: emailRecord.id },
          data: { status: 'FAILED' },
        });
      }
    }
  } catch (err) {
    console.error('❌ processDueEmails error:', err);
  } finally {
    processing = false;
  }
}

// ─── Crash recovery: reset stuck PROCESSING emails ───────────────────────────

async function recoverStuckProcessing(): Promise<void> {
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const stuck = await prisma.scheduledEmail.updateMany({
    where: { status: 'PROCESSING', updatedAt: { lt: stuckCutoff } },
    data: { status: 'PENDING' },
  });
  if (stuck.count > 0) {
    console.log(`♻️ Recovered ${stuck.count} stuck PROCESSING email(s) → PENDING`);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

prisma.$connect()
  .then(async () => {
    console.log('✅ Worker connected to PostgreSQL');
    await recoverStuckProcessing();
    await processDueEmails(); // run immediately on startup
    setInterval(processDueEmails, POLL_INTERVAL_MS);
    setInterval(recoverStuckProcessing, 5 * 60 * 1000);
    console.log(`🚀 Email Worker started — polling every ${POLL_INTERVAL_MS / 1000}s`);
  })
  .catch((err: Error) => {
    console.error('❌ Worker failed to connect to DB:', err);
    process.exit(1);
  });


