import { Request, Response } from 'express';
import { prisma } from '../config/db'; 
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
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getScheduledEmails = async (_req: Request, res: Response): Promise<void> => {
  try {
    const emails = await prisma.scheduledEmail.findMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      orderBy: { sendAt: 'asc' },
    });
    
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

export const requeuePending = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Reset any emails stuck in PROCESSING (worker crashed mid-batch) back to PENDING
    const stuck = await prisma.scheduledEmail.updateMany({
      where: { status: 'PROCESSING' },
      data: { status: 'PENDING' },
    });

    const overdue = await prisma.scheduledEmail.count({
      where: { status: 'PENDING', sendAt: { lte: new Date() } },
    });

    const msg = `Reset ${stuck.count} stuck PROCESSING → PENDING. ${overdue} overdue email(s) will be picked up by the worker within 10s.`;
    console.log('🔁', msg);
    res.json({ message: msg, stuckReset: stuck.count, overdueCount: overdue });
  } catch (error) {
    console.error('❌ requeuePending error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to reset pending', detail: msg });
  }
};