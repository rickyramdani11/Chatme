const nodemailer = require('nodemailer');
const { maskEmail, maskOTP } = require('../utils/maskSensitiveData');

// Create SMTP transporter using Gmail
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // use STARTTLS
  auth: {
    user: 'meongkwl@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD
  },
  tls: {
    rejectUnauthorized: true
  }
});

async function sendVerificationEmail(email, username, otpCode) {
  console.log('📧 Attempting to send verification email to:', maskEmail(email), 'with OTP:', maskOTP(otpCode));
  try {
    const mailOptions = {
      from: '"ChatMe" <meongkwl@gmail.com>',
      to: email,
      subject: 'Verify Your ChatMe Account',
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0;">Welcome to ChatMe!</h1>
            </div>
            <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #333;">Hi <strong>${username}</strong>,</p>
              <p style="font-size: 16px; color: #333;">Thank you for signing up! Please use the verification code below to activate your account.</p>
              <div style="text-align: center; margin: 30px 0;">
                <div style="background-color: #4CAF50; color: white; padding: 20px; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 5px; display: inline-block;">
                  ${otpCode}
                </div>
              </div>
              <p style="font-size: 14px; color: #666; text-align: center;">Enter this code in the app to verify your account</p>
              <p style="font-size: 14px; color: #666; margin-top: 20px; text-align: center;">This code will expire in 10 minutes.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
              <p style="font-size: 12px; color: #999;">If you didn't create this account, please ignore this email.</p>
            </div>
          </body>
        </html>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent successfully to:', maskEmail(email));
    console.log('SMTP response:', result.messageId);
    return result;
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    throw error;
  }
}

async function sendPasswordResetOTP(email, username, otpCode) {
  console.log('📧 Attempting to send password reset OTP to:', maskEmail(email), 'with OTP:', maskOTP(otpCode));
  try {
    const mailOptions = {
      from: '"ChatMe" <meongkwl@gmail.com>',
      to: email,
      subject: 'Reset Your ChatMe Password',
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #FF6B6B; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0;">Reset Your Password</h1>
            </div>
            <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #333;">Hi <strong>${username}</strong>,</p>
              <p style="font-size: 16px; color: #333;">You requested to reset your password. Use the code below to continue:</p>
              <div style="text-align: center; margin: 30px 0;">
                <div style="background-color: #FF6B6B; color: white; padding: 20px; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 5px; display: inline-block;">
                  ${otpCode}
                </div>
              </div>
              <p style="font-size: 14px; color: #666; text-align: center;">Enter this code in the app to reset your password</p>
              <p style="font-size: 14px; color: #666; margin-top: 20px; text-align: center;">This code will expire in 10 minutes.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
              <p style="font-size: 12px; color: #999;">If you didn't request this, please ignore this email and your password will remain unchanged.</p>
            </div>
          </body>
        </html>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset OTP sent successfully to:', maskEmail(email));
    console.log('SMTP response:', result.messageId);
    return result;
  } catch (error) {
    console.error('❌ Failed to send password reset OTP:', error);
    throw error;
  }
}

async function sendOTP(email, otpCode, purpose = 'verifikasi') {
  console.log('📧 Attempting to send OTP to:', maskEmail(email), 'with OTP:', maskOTP(otpCode), 'for purpose:', purpose);
  try {
    const mailOptions = {
      from: '"ChatMe" <meongkwl@gmail.com>',
      to: email,
      subject: 'Kode Verifikasi ChatMe',
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #9C27B0; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0;">Kode Verifikasi ChatMe</h1>
            </div>
            <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #333;">Halo,</p>
              <p style="font-size: 16px; color: #333;">Gunakan kode verifikasi di bawah ini ${purpose}:</p>
              <div style="text-align: center; margin: 30px 0;">
                <div style="background-color: #9C27B0; color: white; padding: 20px; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 5px; display: inline-block;">
                  ${otpCode}
                </div>
              </div>
              <p style="font-size: 14px; color: #666; text-align: center;">Masukkan kode ini di aplikasi untuk melanjutkan</p>
              <p style="font-size: 14px; color: #666; margin-top: 20px; text-align: center;">Kode ini akan kadaluarsa dalam 10 menit.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
              <p style="font-size: 12px; color: #999;">Jika Anda tidak meminta kode ini, abaikan email ini.</p>
            </div>
          </body>
        </html>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent successfully to:', maskEmail(email));
    console.log('SMTP response:', result.messageId);
    return result;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error);
    throw error;
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetOTP,
  sendOTP
};
