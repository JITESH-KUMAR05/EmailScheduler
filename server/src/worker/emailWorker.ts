import { Worker, Job } from 'bullmq';
import { prisma } from '../config/db';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import { emailQueue } from './queue';

dotenv.config();

// Redis connection config for the worker
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT) || 6379;
const redisPassword = process.env.REDIS_PASSWORD;
// Set REDIS_TLS=true when using Azure Cache for Redis (port 6380)
const redisTLS = process.env.REDIS_TLS === 'true';

// Build connection config conditionally
const redisConnection: any = {
  host: redisHost,
  port: redisPort,
};

// Only add password if it exists (not needed for local Docker Redis)
if (redisPassword) {
  redisConnection.password = redisPassword;
}

// Enable TLS for Azure Cache for Redis
if (redisTLS) {
  redisConnection.tls = { rejectUnauthorized: false };
}

// Create SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify SMTP connection
transporter.verify((error) => {
  if (error) {
    console.error('❌ SMTP connection failed:', error);
  } else {
    console.log('✅ SMTP server is ready to send emails');
  }
});

interface EmailJob {
  emailId: number;
  email: string;
  subject: string;
  body: string;
  sender: string;
}

// Rate limiting helper
async function checkRateLimit(sender: string): Promise<boolean> {
  const now = new Date();
  const hourWindow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;

  const maxEmailsPerHour = Number(process.env.MAX_EMAILS_PER_HOUR) || 200;

  // Get or create rate limit record
  const rateLimit = await prisma.rateLimit.upsert({
    where: {
      sender_hourWindow: {
        sender,
        hourWindow,
      },
    },
    create: {
      sender,
      hourWindow,
      emailCount: 1,
    },
    update: {
      emailCount: {
        increment: 1,
      },
    },
  });

  return rateLimit.emailCount <= maxEmailsPerHour;
}

// 🆕 UPDATED: Clean up stale jobs + Re-queue expired PENDING emails
async function cleanupStaleJobs() {
  try {
    const redis = new Redis(redisConnection);
    
    // Get all job IDs from the queue
    const waitingJobs = await redis.lrange('bull:email-queue:wait', 0, -1);
    const delayedJobs = await redis.zrange('bull:email-queue:delayed', 0, -1);
    const activeJobs = await redis.lrange('bull:email-queue:active', 0, -1);
    
    const allJobIds = [...waitingJobs, ...delayedJobs, ...activeJobs];
    
    console.log(`🔍 Found ${allJobIds.length} jobs in Redis queue`);
    
    // Check which emails exist in database with PENDING status
    const pendingEmails = await prisma.scheduledEmail.findMany({
      where: { status: 'PENDING' },
      select: { id: true, sendAt: true, email: true, subject: true, body: true, sender: true },
    });
    
    const validEmailIds = new Set(pendingEmails.map(e => e.id));
    
    console.log(`📊 Found ${validEmailIds.size} pending emails in database`);
    
    // Remove jobs for emails that don't exist or aren't pending anymore
    let staleCount = 0;
    for (const jobId of allJobIds) {
      const emailId = parseInt(jobId.replace('email-', ''));
      
      if (!validEmailIds.has(emailId)) {
        console.log(`🗑️ Removing stale job: ${jobId}`);
        await redis.del(`bull:email-queue:${jobId}`);
        staleCount++;
      }
    }
    
    if (staleCount > 0) {
      console.log(`✅ Cleaned ${staleCount} stale jobs from queue`);
    }
    
    // 🆕 Find expired emails (time has passed but still PENDING)
    const now = new Date();
    const expiredEmails = pendingEmails.filter(e => e.sendAt < now);
    
    if (expiredEmails.length > 0) {
      console.log(`⏰ Found ${expiredEmails.length} expired pending emails - re-queuing them now`);
      
      for (const email of expiredEmails) {
        // Check if job already exists in queue
        const jobId = `email-${email.id}`;
        const existingJob = await emailQueue.getJob(jobId);
        
        if (!existingJob) {
          // Add to queue with no delay (send immediately)
          await emailQueue.add(
            'send-email',
            {
              emailId: email.id,
              email: email.email,
              subject: email.subject,
              body: email.body,
              sender: email.sender,
            },
            {
              delay: 0, // Send immediately
              jobId: jobId,
              priority: 1, // Higher priority than future emails
            }
          );
          console.log(`📨 Re-queued expired email ${email.id} to ${email.email}`);
        }
      }
    }
    
    await redis.quit();
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

// Test database connection
prisma.$connect()
  .then(async () => {
    console.log('✅ Connected to PostgreSQL database');
    // Run cleanup after connecting to database
    await cleanupStaleJobs();
  })
  .catch((err: Error) => {
    console.error('❌ Failed to connect to database:', err);
    process.exit(1);
  });

// Create the worker
const worker = new Worker<EmailJob>(
  'email-queue',
  async (job: Job<EmailJob>) => {
    const { emailId, email, subject, body, sender } = job.data;

    console.log(`📧 [Job ${job.id}] Processing email to: ${email}`);

    try {
      // Check if email still exists and is pending
      const emailRecord = await prisma.scheduledEmail.findUnique({
        where: { id: emailId },
      });
      
      if (!emailRecord) {
        console.log(`⚠️ [Job ${job.id}] Email ${emailId} not found in database, skipping`);
        return { success: false, reason: 'EMAIL_NOT_FOUND' };
      }
      
      if (emailRecord.status !== 'PENDING') {
        console.log(`⚠️ [Job ${job.id}] Email ${emailId} already processed (${emailRecord.status}), skipping`);
        return { success: false, reason: 'ALREADY_PROCESSED' };
      }

      // Check rate limit
      const canSend = await checkRateLimit(sender);

      if (!canSend) {
        console.log(`⏸️ [Job ${job.id}] Rate limit reached for ${sender}. Delaying...`);
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      // Add minimum delay between emails
      const minDelay = Number(process.env.MIN_DELAY_BETWEEN_EMAILS) || 2;
      await new Promise(resolve => setTimeout(resolve, minDelay * 1000));

      // Send email via Ethereal
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: subject,
        text: body,
        html: `<p>${body}</p>`,
      });

      console.log(`✅ [Job ${job.id}] Email sent: ${info.messageId}`);
      console.log(`🔗 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);

      // Update database
      const updatedEmail = await prisma.scheduledEmail.update({
        where: { id: emailId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      console.log(`📊 DB CONFIRM: Email ${emailId} → Status: ${updatedEmail.status}, SentAt: ${updatedEmail.sentAt}`);

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ [Job ${job.id}] Failed to send email:`, error);

      await prisma.scheduledEmail.update({
        where: { id: emailId },
        data: {
          status: 'FAILED',
        },
      });

      throw error;
    }
  },
  {
    connection: redisConnection,
    prefix: '{bull}', // Required for Redis cluster mode (Azure Managed Redis)
    concurrency: Number(process.env.WORKER_CONCURRENCY) || 5,
    limiter: {
      max: Number(process.env.MAX_EMAILS_PER_HOUR) || 200,
      duration: 3600000, // 1 hour
    },
  }
);

// Worker event handlers
worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

// 🆕 Periodically check for expired emails every 2 minutes
setInterval(async () => {
  try {
    const now = new Date();
    const expiredEmails = await prisma.scheduledEmail.findMany({
      where: {
        status: 'PENDING',
        sendAt: {
          lt: now,
        },
      },
      select: { id: true, email: true, subject: true, body: true, sender: true },
    });

    if (expiredEmails.length > 0) {
      console.log(`⏰ Periodic check: Found ${expiredEmails.length} expired emails to send`);
      
      for (const email of expiredEmails) {
        const jobId = `email-${email.id}`;
        const existingJob = await emailQueue.getJob(jobId);
        
        if (!existingJob) {
          await emailQueue.add(
            'send-email',
            {
              emailId: email.id,
              email: email.email,
              subject: email.subject,
              body: email.body,
              sender: email.sender,
            },
            {
              delay: 0,
              jobId: jobId,
              priority: 1,
            }
          );
          console.log(`📨 Re-queued expired email ${email.id}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Periodic check failed:', error);
  }
}, 2 * 60 * 1000); // Every 2 minutes

console.log('🚀 Email Worker Started...');
console.log(`⚙️ Concurrency: ${process.env.WORKER_CONCURRENCY || 5}`);
console.log(`⏱️ Min delay: ${process.env.MIN_DELAY_BETWEEN_EMAILS || 2}s`);
console.log(`📊 Rate limit: ${process.env.MAX_EMAILS_PER_HOUR || 200} emails/hour`);
console.log('⏰ Periodic expired email check: Every 2 minutes');
console.log('📬 Waiting for jobs...');