import { Router } from 'express';
import { scheduleEmails, getScheduledEmails, getSentEmails } from '../controllers/emailController';

const router = Router();

// Email scheduling routes
router.post('/schedule', scheduleEmails);
router.get('/scheduled', getScheduledEmails);
router.get('/sent', getSentEmails);

export default router;