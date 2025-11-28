import { logger } from '../lib/logger.js';

// TODO: Integrate with Twilio
// For now, this is a stub that logs the OTP

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return null;
  }

  return { accountSid, authToken, fromNumber };
}

/**
 * Send SMS OTP via Twilio
 */
export async function sendSmsOtp(phone: string, otp: string): Promise<void> {
  const config = getTwilioConfig();

  if (!config) {
    logger.warn({ phone }, 'Twilio not configured, logging OTP instead');
    logger.info({ phone, otp }, '📱 OTP Code');
    return;
  }

  try {
    // TODO: Implement actual Twilio integration
    // const client = twilio(config.accountSid, config.authToken);
    // await client.messages.create({
    //   body: `Your PaYa code is: ${otp}. Expires in 5 minutes.`,
    //   from: config.fromNumber,
    //   to: phone,
    // });

    logger.info({ phone }, 'SMS OTP sent');
  } catch (error) {
    logger.error({ error, phone }, 'Failed to send SMS OTP');
    throw new Error('Failed to send SMS');
  }
}

/**
 * Send generic SMS notification
 */
export async function sendSms(phone: string, message: string): Promise<void> {
  const config = getTwilioConfig();

  if (!config) {
    logger.warn({ phone, message }, 'Twilio not configured, logging message instead');
    return;
  }

  try {
    // TODO: Implement actual Twilio integration
    logger.info({ phone }, 'SMS sent');
  } catch (error) {
    logger.error({ error, phone }, 'Failed to send SMS');
    throw new Error('Failed to send SMS');
  }
}

