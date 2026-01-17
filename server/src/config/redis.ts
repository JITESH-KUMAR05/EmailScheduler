import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisPassword = process.env.REDIS_PASSWORD;

export const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(redisPassword && { password: redisPassword }),
    maxRetriesPerRequest: null,
});

redisConnection.on('connect', () => {
    console.log('Connected to Redis');
});

redisConnection.on('error', (err) => {
    console.error('Redis error', err);
    process.exit(-1);
});

export default redisConnection;