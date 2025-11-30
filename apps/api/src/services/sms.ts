import twilio from 'twilio';
import { logger } from '../lib/logger.js';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

let twilioClient: ReturnType<typeof twilio> | null = null;

function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return null;
  }

  return { accountSid, authToken, fromNumber };
}

function getTwilioClient(): ReturnType<typeof twilio> | null {
  if (twilioClient) return twilioClient;

  const config = getTwilioConfig();
  if (!config) return null;

  twilioClient = twilio(config.accountSid, config.authToken);
  logger.info('Twilio client initialized');
  return twilioClient;
}

/**
 * Send SMS OTP via Twilio
 */
export async function sendSmsOtp(phone: string, otp: string): Promise<void> {
  const config = getTwilioConfig();
  const client = getTwilioClient();

  if (!config || !client) {
    // Development mode - just log the OTP
    logger.warn({ phone }, 'Twilio not configured, logging OTP instead');
    logger.info({ phone, otp }, '📱 OTP Code (dev mode)');
    return;
  }

  try {
    await client.messages.create({
      body: `Your PaYa code is: ${otp}. Expires in 5 minutes.`,
      from: config.fromNumber,
      to: phone,
    });

    logger.info({ phone: phone.slice(-4) }, 'SMS OTP sent via Twilio');
  } catch (error: any) {
    logger.error({ error: error.message, phone: phone.slice(-4) }, 'Failed to send SMS OTP');
    // Don't throw in dev - allow testing without Twilio
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Failed to send SMS');
    }
  }
}

/**
 * Send generic SMS notification (for invites, etc.)
 */
export async function sendSms(phone: string, message: string): Promise<void> {
  const config = getTwilioConfig();
  const client = getTwilioClient();

  if (!config || !client) {
    // Development mode - just log the message
    logger.warn({ phone, message }, '📱 SMS (dev mode - Twilio not configured)');
    return;
  }

  try {
    await client.messages.create({
      body: message,
      from: config.fromNumber,
      to: phone,
    });

    logger.info({ phone: phone.slice(-4) }, 'SMS sent via Twilio');
  } catch (error: any) {
    logger.error({ error: error.message, phone: phone.slice(-4) }, 'Failed to send SMS');
    // Don't throw - invites failing shouldn't block the payment
  }
}

/**
 * Send payment invite SMS to non-user
 */
export async function sendPaymentInvite(
  phone: string,
  senderUsername: string,
  amount: number
): Promise<void> {
  const message = `${senderUsername} sent you $${amount} on PaYa! Download the app to claim your money: https://paya.cash/download`;
  await sendSms(phone, message);
}
