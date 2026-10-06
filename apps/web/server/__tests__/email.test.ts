import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateOtp, getOtpExpiryMinutes, getMaxOtpAttempts, classifySmtpError, isSmtpConfigured } from '../email';

describe('generateOtp', () => {
  it('should generate a 6-digit OTP by default', () => {
    const otp = generateOtp();
    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it('should generate OTP of specified length', () => {
    expect(generateOtp(4)).toHaveLength(4);
    expect(generateOtp(8)).toHaveLength(8);
  });

  it('should only contain digits', () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateOtp();
      expect(/^\d+$/.test(otp)).toBe(true);
    }
  });

  it('should generate different OTPs each time', () => {
    const otps = new Set(Array.from({ length: 50 }, () => generateOtp()));
    expect(otps.size).toBeGreaterThan(1);
  });

  it('should not contain letters or special characters', () => {
    for (let i = 0; i < 10; i++) {
      const otp = generateOtp();
      expect(/[a-zA-Z!@#$%^&*]/.test(otp)).toBe(false);
    }
  });
});

describe('getOtpExpiryMinutes', () => {
  beforeEach(() => {
    delete process.env.OTP_EXPIRY_MINUTES;
  });

  afterEach(() => {
    delete process.env.OTP_EXPIRY_MINUTES;
  });

  it('should return default of 5 minutes when env not set', () => {
    expect(getOtpExpiryMinutes()).toBe(5);
  });

  it('should return value from OTP_EXPIRY_MINUTES env var', () => {
    process.env.OTP_EXPIRY_MINUTES = '10';
    expect(getOtpExpiryMinutes()).toBe(10);
  });

  it('should parse string to number', () => {
    process.env.OTP_EXPIRY_MINUTES = '15';
    const result = getOtpExpiryMinutes();
    expect(typeof result).toBe('number');
    expect(result).toBe(15);
  });
});

describe('getMaxOtpAttempts', () => {
  beforeEach(() => {
    delete process.env.MAX_OTP_ATTEMPTS;
  });

  afterEach(() => {
    delete process.env.MAX_OTP_ATTEMPTS;
  });

  it('should return default of 5 attempts when env not set', () => {
    expect(getMaxOtpAttempts()).toBe(5);
  });

  it('should return value from MAX_OTP_ATTEMPTS env var', () => {
    process.env.MAX_OTP_ATTEMPTS = '3';
    expect(getMaxOtpAttempts()).toBe(3);
  });

  it('should return a positive integer', () => {
    const result = getMaxOtpAttempts();
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('OTP security properties', () => {
  it('should never generate an OTP starting with 0 that would lose digits', () => {
    for (let i = 0; i < 100; i++) {
      const otp = generateOtp(6);
      expect(otp).toHaveLength(6);
    }
  });

  it('should produce values in range 000000-999999 for 6-digit OTP', () => {
    for (let i = 0; i < 50; i++) {
      const otp = generateOtp(6);
      const num = parseInt(otp, 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(999999);
    }
  });
});

describe('classifySmtpError (Microsoft 365)', () => {
  it('detects SMTP AUTH disabled for the tenant', () => {
    const f = classifySmtpError({
      code: 'EAUTH',
      responseCode: 535,
      response: '535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Tenant.',
    });
    expect(f.category).toBe('SMTP_AUTH_DISABLED');
    expect(f.hint).toMatch(/Authenticated SMTP/);
  });

  it('detects a plain wrong username/password', () => {
    const f = classifySmtpError({ code: 'EAUTH', responseCode: 535, response: '535 5.7.3 Authentication unsuccessful' });
    expect(f.category).toBe('AUTH_FAILED');
  });

  it('detects a sender the mailbox may not send as', () => {
    const f = classifySmtpError({
      code: 'EENVELOPE',
      responseCode: 554,
      response: '554 5.2.252 SendAsDenied; contact@okiru.co.za not allowed to send as other@okiru.co.za',
    });
    expect(f.category).toBe('INVALID_SENDER');
  });

  it('detects TLS failures', () => {
    expect(classifySmtpError({ code: 'ESOCKET', message: 'write EPROTO error:0A00010B:SSL routines::wrong version number' }).category).toBe('TLS_FAILED');
    expect(classifySmtpError({ code: 'ETLS', message: 'Error upgrading connection with STARTTLS' }).category).toBe('TLS_FAILED');
  });

  it('detects connection failures', () => {
    expect(classifySmtpError({ code: 'ECONNECTION', message: 'Connection timeout' }).category).toBe('CONNECTION_FAILED');
    expect(classifySmtpError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND smtp.office365.com' }).category).toBe('CONNECTION_FAILED');
  });

  it('falls back to UNKNOWN', () => {
    expect(classifySmtpError(new Error('something odd')).category).toBe('UNKNOWN');
    expect(classifySmtpError(undefined).category).toBe('UNKNOWN');
  });

  it('never echoes the SMTP password back in a message', () => {
    process.env.SMTP_PASSWORD = 'Sup3r-Secret-Pw!';
    try {
      const f = classifySmtpError({ code: 'EAUTH', response: '535 Invalid login for Sup3r-Secret-Pw!' });
      expect(f.message).not.toContain('Sup3r-Secret-Pw!');
      expect(JSON.stringify(f)).not.toContain('Sup3r-Secret-Pw!');
    } finally {
      delete process.env.SMTP_PASSWORD;
    }
  });
});

describe('isSmtpConfigured', () => {
  const keys = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PASS'] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => { for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it('is false until host, user and password are all set', () => {
    process.env.SMTP_HOST = 'smtp.office365.com';
    process.env.SMTP_USER = 'contact@okiru.co.za';
    expect(isSmtpConfigured()).toBe(false);
    process.env.SMTP_PASSWORD = 'x';
    expect(isSmtpConfigured()).toBe(true);
  });

  it('still honours the legacy SMTP_PASS name', () => {
    process.env.SMTP_HOST = 'h';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASS = 'x';
    expect(isSmtpConfigured()).toBe(true);
  });
});
