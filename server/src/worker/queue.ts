import { Queue } from 'bullmq';

const redisPassword = process.env.REDIS_PASSWORD;

export const emailQueue = new Queue('email-queue', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(redisPassword && { password: redisPassword }),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

emailQueue.on('error', (err) => {
  console.error('❌ Queue error:', err);
});

console.log('✅ Email queue initialized');