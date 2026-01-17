import { Queue } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPassword = process.env.REDIS_PASSWORD;
const isProduction = redisHost !== 'localhost';

export const emailQueue = new Queue('email-queue', {
  connection: {
    host: redisHost,
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(redisPassword && { password: redisPassword }),
    ...(isProduction && { 
        tls: {
            rejectUnauthorized: false
        } 
    }),
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