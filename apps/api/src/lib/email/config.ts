import { Resend } from 'resend';
import { secrets } from '../secrets.js';

const RESEND_API_KEY = secrets.getResendApiKey();

export const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export const EMAIL_CONFIG = {
  from: process.env['EMAIL_FROM'] || 'Cost Watchdog <alerts@costwatchdog.de>',
  replyTo: process.env['EMAIL_REPLY_TO'] || 'support@costwatchdog.de',
};
