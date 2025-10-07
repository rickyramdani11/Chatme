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

async function sendVerificationEmail(email, username, otpCode) {
  try {
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
