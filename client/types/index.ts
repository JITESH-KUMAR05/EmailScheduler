export interface User {
  name: string;
  email: string;
  picture: string;
}

export interface Email {
  id: number;
  email: string;
  subject: string;
  body: string;
  status: string;
  sendAt: string;
  sentAt?: string;
  batchId?: string;
  sender: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEmailRequest {
  emails: Array<{
    email: string;
    subject: string;
    body: string;
  }>;
  startTime: string;
  delayInSeconds: number;
  sender?: string;
}

export interface ScheduleEmailResponse {
  message: string;
  count: number;
  batchId: string;
  startTime: string;
}