const brevo = require('@getbrevo/brevo');

const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
  brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

async function sendVerificationEmail(email, username, token) {
  try {
    const verificationUrl = `https://web.chatmeapp.online/api/auth/verify-email?token=${token}`;
    
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.subject = "Verify Your ChatMe Account";
    sendSmtpEmail.to = [{ email: email, name: username }];
    sendSmtpEmail.sender = { 
      name: "ChatMe", 
      email: process.env.BREVO_SENDER_EMAIL || "noreply@chatmeapp.online" 
    };
    sendSmtpEmail.htmlContent = `
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
    `;

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Verification email sent successfully to:', email);
    console.log('Brevo response:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    throw error;
  }
}

module.exports = {
  sendVerificationEmail
};
