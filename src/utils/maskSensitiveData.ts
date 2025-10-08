/**
 * Utility function to mask sensitive data in logs (Frontend)
 * Prevents exposure of passwords, emails, phones, OTPs, tokens, etc.
 */

export function maskEmail(email: string | undefined | null): string {
  if (!email || typeof email !== 'string') return String(email);
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const maskedLocal = local.length > 2 
    ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
    : '***';
  return `${maskedLocal}@${domain}`;
}

export function maskPhone(phone: string | undefined | null): string {
  if (!phone || typeof phone !== 'string') return String(phone);
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 4) return '***';
  return cleaned.slice(0, 2) + '*'.repeat(cleaned.length - 4) + cleaned.slice(-2);
}

export function maskToken(token: string | undefined | null): string {
  if (!token || typeof token !== 'string') return String(token);
  if (token.length < 8) return '***';
  return token.slice(0, 4) + '...' + token.slice(-4);
}

export function maskPassword(): string {
  return '***HIDDEN***';
}

export function maskOTP(otp: string | number | undefined | null): string {
  if (!otp) return String(otp);
  return '***OTP***';
}

export function maskSensitiveData(data: any, options: { additionalFields?: string[] } = {}): any {
  if (!data || typeof data !== 'object') return data;

  const masked = { ...data };
  const sensitiveFields = [
    'password', 'newPassword', 'oldPassword', 'confirmPassword',
    'otp', 'otpCode', 'verificationCode',
    'token', 'accessToken', 'refreshToken', 'authToken', 'jwt',
    'apiKey', 'secretKey', 'privateKey',
    ...(options.additionalFields || [])
  ];

  const emailFields = ['email', 'emailAddress', 'userEmail'];
  const phoneFields = ['phone', 'phoneNumber', 'mobile', 'mobileNumber'];

  for (const key in masked) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
      masked[key] = maskPassword();
    } else if (emailFields.some(field => lowerKey.includes(field))) {
      masked[key] = maskEmail(masked[key]);
    } else if (phoneFields.some(field => lowerKey.includes(field))) {
      masked[key] = maskPhone(masked[key]);
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key], options);
    }
  }

  return masked;
}
