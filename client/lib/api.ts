import axios from 'axios';
import { Email, ScheduleEmailRequest, ScheduleEmailResponse } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const emailAPI = {
  scheduleEmails: (data: ScheduleEmailRequest) =>
    api.post<ScheduleEmailResponse>('/api/emails/schedule', data),
  
  getScheduledEmails: () =>
    api.get<Email[]>('/api/emails/scheduled'),
  
  getSentEmails: () =>
    api.get<Email[]>('/api/emails/sent'),
};