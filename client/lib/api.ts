import axios from 'axios';
import { Email, ScheduleEmailRequest, ScheduleEmailResponse } from '@/types';

// Auto-upgrade http → https when running on a secure origin (prevents Mixed Content errors)
const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const API_URL =
  typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? rawUrl.replace(/^http:\/\//, 'https://')
    : rawUrl;

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  },
});

export const emailAPI = {
  scheduleEmails: (data: ScheduleEmailRequest) =>
    api.post<ScheduleEmailResponse>('/api/emails/schedule', data),
  
  getScheduledEmails: () =>
    api.get<Email[]>('/api/emails/scheduled', {
      params: { _t: Date.now() }, 
      headers: { 'Cache-Control': 'no-cache' }
    }),
  
  getSentEmails: () =>
    api.get<Email[]>('/api/emails/sent', {
      params: { _t: Date.now() }, 
      headers: { 'Cache-Control': 'no-cache' }
    }),
};