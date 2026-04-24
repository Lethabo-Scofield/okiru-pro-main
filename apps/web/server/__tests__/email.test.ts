import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateOtp, getOtpExpiryMinutes, getMaxOtpAttempts } from '../email';

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
