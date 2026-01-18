import { Worker, Job } from 'bullmq';
import { prisma } from '../config/db';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Redis connection config for the worker
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPassword = process.env.REDIS_PASSWORD;
const isProduction = redisHost !== 'localhost';

const redisConnection = {
  host: redisHost,
  port: Number(process.env.REDIS_PORT) || 6379,
  ...(redisPassword && { password: redisPassword }),
  ...(isProduction && { 
    tls: {
      rejectUnauthorized: false
    } 
  }),
};

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

// Create the worker
const worker = new Worker<EmailJob>(
  'email-queue',
  async (job: Job<EmailJob>) => {
    const { emailId, email, subject, body, sender } = job.data;

    console.log(`📧 [Job ${job.id}] Processing email to: ${email}`);

    try {
      // Check rate limit
      const canSend = await checkRateLimit(sender);

      if (!canSend) {
        console.log(`⏸️ [Job ${job.id}] Rate limit reached for ${sender}. Delaying...`);
        
        // Reschedule for next hour - BullMQ will retry with backoff
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

      console.log(`📊 Database updated: Email ${emailId} status = ${updatedEmail.status}`);

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ [Job ${job.id}] Failed to send email:`, error);

      // Update database with failure
      await prisma.scheduledEmail.update({
        where: { id: emailId },
        data: {
          status: 'FAILED',
        },
      });

      throw error; // BullMQ will retry based on job options
    }
  },
  {
    connection: redisConnection,
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

// Test database connection
prisma.$connect()
  .then(() => {
    console.log('✅ Connected to PostgreSQL database');
  })
  .catch((err: Error) => {
    console.error('❌ Failed to connect to database:', err);
    process.exit(1);
  });

console.log('🚀 Email Worker Started...');
console.log(`⚙️ Concurrency: ${process.env.WORKER_CONCURRENCY || 5}`);
console.log(`⏱️ Min delay: ${process.env.MIN_DELAY_BETWEEN_EMAILS || 2}s`);
console.log(`📊 Rate limit: ${process.env.MAX_EMAILS_PER_HOUR || 200} emails/hour`);
console.log('📬 Waiting for jobs...');