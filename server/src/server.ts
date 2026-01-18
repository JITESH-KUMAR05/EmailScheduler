import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './config/db'; 
import { redisConnection } from './config/redis';
import apiRoutes from './routes/apiRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001", 
    "https://email-scheduler-red.vercel.app" 
  ],
  credentials: true
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    redis: redisConnection.status,
  });
});

app.use('/api/emails', apiRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect(); 
  await redisConnection.quit();
  process.exit(0);
});