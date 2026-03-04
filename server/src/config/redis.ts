import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT) || 6379;
const redisPassword = process.env.REDIS_PASSWORD;
// Set REDIS_TLS=true when using Azure Cache for Redis (port 6380)
const redisTLS = process.env.REDIS_TLS === 'true';

// Build config object conditionally
const redisConfig: any = {
    host: redisHost,
    port: redisPort,
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
};

// Only add password if it exists (not needed for local Docker Redis)
if (redisPassword) {
    redisConfig.password = redisPassword;
}

// Enable TLS for Azure Cache for Redis
if (redisTLS) {
    redisConfig.tls = { rejectUnauthorized: false };
}

export const redisConnection = new Redis(redisConfig);

redisConnection.on('connect', () => {
    console.log('✅ Connected to Redis');
});

redisConnection.on('error', (err) => {
    console.error('❌ Redis error', err);
});

export default redisConnection;