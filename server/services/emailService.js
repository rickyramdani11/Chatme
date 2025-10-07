const nodemailer = require('nodemailer');

// Create SMTP transporter
const transporter = nodemailer.createTransport({
  host: 'mail.chatmeapp.online',
  port: 465,
  secure: true, // use SSL
  auth: {
    user: 'noreply@chatmeapp.online',
    pass: process.env.SMTP_PASSWORD
  }
});

async function sendVerificationEmail(email, username, token) {
  try {
    const verificationUrl = `https://web.chatmeapp.online/api/auth/verify-email?token=${token}`;
    
    const mailOptions = {
      from: '"ChatMe" <noreply@chatmeapp.online>',
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
              <p style="font-size: 16px; color: #333;">Thank you for signing up! Please verify your email address to activate your account.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" 
                   style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
                  Verify Email Address
                </a>
              </div>
              <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
              <p style="font-size: 12px; color: #999; word-break: break-all; background-color: #eee; padding: 10px; border-radius: 5px;">${verificationUrl}</p>
              <p style="font-size: 14px; color: #666; margin-top: 20px;">This link will expire in 24 hours.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
              <p style="font-size: 12px; color: #999;">If you didn't create this account, please ignore this email.</p>
            </div>
          </body>
        </html>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent successfully to:', email);
    console.log('SMTP response:', result.messageId);
    return result;
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    throw error;
  }
}

module.exports = {
  sendVerificationEmail
};
