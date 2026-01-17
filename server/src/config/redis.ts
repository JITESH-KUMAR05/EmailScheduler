import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisPassword = process.env.REDIS_PASSWORD;
const redisHost = process.env.REDIS_HOST || 'localhost';

const isProduction = redisHost !== 'localhost';

export const redisConnection = new Redis({
    host: redisHost,
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(redisPassword && { password: redisPassword }),
    maxRetriesPerRequest: null,
    ...(isProduction && { 
        tls: {
            rejectUnauthorized: false
        } 
    }), 
});

redisConnection.on('connect', () => {
    console.log('✅ Connected to Redis');
});

redisConnection.on('error', (err) => {
    console.error('❌ Redis error', err);
});

export default redisConnection;