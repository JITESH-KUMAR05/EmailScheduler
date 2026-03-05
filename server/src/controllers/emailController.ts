import { Request, Response } from 'express';
import { prisma } from '../config/db'; 
import { emailQueue } from '../worker/queue';
import { v4 as uuidv4 } from 'uuid';

interface EmailRequest {
  email: string;
  subject: string;
  body: string;
}

interface ScheduleRequest {
  emails: EmailRequest[];
  startTime: string;
  delayInSeconds: number;
  sender?: string;
}

export const scheduleEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { emails, startTime, delayInSeconds, sender = 'default' } = req.body as ScheduleRequest;

    if (!emails || emails.length === 0) {
      res.status(400).json({ error: 'No emails provided' });
      return;
    }

    if (!startTime) {
      res.status(400).json({ error: 'Start time is required' });
      return;
    }

    const batchId = uuidv4();
    const startDateTime = new Date(startTime);

    if (startDateTime <= new Date()) {
      res.status(400).json({ error: 'Start time must be in the future' });
      return;
    }

    const scheduledJobs = [];

    for (let i = 0; i < emails.length; i++) {
      const emailData = emails[i]!;
      const sendTime = new Date(startDateTime.getTime() + i * delayInSeconds * 1000);

      const savedEmail = await prisma.scheduledEmail.create({
        data: {
          email: emailData.email,
          subject: emailData.subject,
          body: emailData.body,
          sendAt: sendTime,
          batchId,
          sender,
          status: 'PENDING',
        },
      });

      const delay = sendTime.getTime() - Date.now();

      await emailQueue.add(
        'send-email',
        {
          emailId: savedEmail.id,
          email: savedEmail.email,
          subject: savedEmail.subject,
          body: savedEmail.body,
          sender,
        },
        {
          delay: Math.max(0, delay),
          jobId: `email-${savedEmail.id}`,
        }
      );

      scheduledJobs.push(savedEmail.id);
    }

    res.status(201).json({
      message: 'Emails scheduled successfully',
      count: scheduledJobs.length,
      batchId,
      startTime: startDateTime.toISOString(),
    });
  } catch (error) {
    console.error('❌ Error scheduling emails:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Internal server error', detail: message });
  }
};

export const getScheduledEmails = async (_req: Request, res: Response): Promise<void> => {
  try {
    const emails = await prisma.scheduledEmail.findMany({
      where: { status: 'PENDING' },
      orderBy: { sendAt: 'asc' },
    });
    
    // Add cache headers to prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json(emails);
  } catch (error) {
    console.error('❌ Error fetching scheduled emails:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled emails' });
  }
};

export const getSentEmails = async (_req: Request, res: Response): Promise<void> => {
  try {
    const emails = await prisma.scheduledEmail.findMany({
      where: {
        status: { in: ['SENT', 'FAILED'] },
      },
      orderBy: { sentAt: 'desc' },
    });
    
    // Add cache headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json(emails);
  } catch (error) {
    console.error('❌ Error fetching sent emails:', error);
    res.status(500).json({ error: 'Failed to fetch sent emails' });
  }
};