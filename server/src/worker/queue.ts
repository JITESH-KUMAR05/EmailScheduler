import { Queue } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT) || 6379;
const redisPassword = process.env.REDIS_PASSWORD;
// Set REDIS_TLS=true when using Azure Cache for Redis (port 6380)
const redisTLS = process.env.REDIS_TLS === 'true';

// Build connection config conditionally
const connectionConfig: any = {
  host: redisHost,
  port: redisPort,
};

// Only add password if it exists (not needed for local Docker Redis)
if (redisPassword) {
  connectionConfig.password = redisPassword;
}

// Enable TLS for Azure Cache for Redis
if (redisTLS) {
  connectionConfig.tls = { rejectUnauthorized: false };
}

export const emailQueue = new Queue('email-queue', {
  connection: connectionConfig,
  prefix: '{bull}', // Required for Redis cluster mode (Azure Managed Redis)
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