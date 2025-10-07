const SibApiV3Sdk = require('@getbrevo/brevo');

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Initialize API key from environment
const apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY;

/**
 * Send verification email to user
 * @param {string} email - User email address
 * @param {string} username - Username
 * @param {string} verificationToken - Verification token
 * @returns {Promise} - Send email promise
 */
async function sendVerificationEmail(email, username, verificationToken) {
  if (!process.env.BREVO_API_KEY) {
    console.warn('⚠️ BREVO_API_KEY not set - skipping email send');
    return { skipped: true, reason: 'No API key' };
  }

  const verificationUrl = `${process.env.APP_URL || 'https://chatme.app'}/verify-email?token=${verificationToken}`;

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  
  sendSmtpEmail.subject = "Verify Your ChatMe Account";
  sendSmtpEmail.htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Welcome to ChatMe! 🎉</h1>
        </div>
        
        <div style="background: #f7f7f7; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">Hi ${username}!</h2>
          <p style="color: #666; line-height: 1.6;">
            Thanks for signing up! Please verify your email address to activate your account and start chatting.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 15px 40px; 
                      text-decoration: none; 
                      border-radius: 50px; 
                      display: inline-block;
                      font-weight: bold;">
              Verify Email Address
            </a>
          </div>
          
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            If you didn't create a ChatMe account, you can safely ignore this email.
          </p>
          
          <p style="color: #999; font-size: 12px;">
            Or copy and paste this link: <br/>
            <span style="color: #667eea;">${verificationUrl}</span>
          </p>
        </div>
      </body>
    </html>
  `;
  sendSmtpEmail.sender = {
    name: "ChatMe",
    email: process.env.BREVO_SENDER_EMAIL || "noreply@chatme.app"
  };
  sendSmtpEmail.to = [{ email, name: username }];

  try {
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Verification email sent to:', email);
    return response;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    throw error;
  }
}

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {string} username - Username
 * @param {string} resetToken - Reset token
 */
async function sendPasswordResetEmail(email, username, resetToken) {
  if (!process.env.BREVO_API_KEY) {
    console.warn('⚠️ BREVO_API_KEY not set - skipping email send');
    return { skipped: true };
  }

  const resetUrl = `${process.env.APP_URL || 'https://chatme.app'}/reset-password?token=${resetToken}`;

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  
  sendSmtpEmail.subject = "Reset Your ChatMe Password";
  sendSmtpEmail.htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Password Reset 🔐</h1>
        </div>
        
        <div style="background: #f7f7f7; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">Hi ${username}!</h2>
          <p style="color: #666; line-height: 1.6;">
            We received a request to reset your password. Click the button below to create a new password.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 15px 40px; 
                      text-decoration: none; 
                      border-radius: 50px; 
                      display: inline-block;
                      font-weight: bold;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            If you didn't request a password reset, you can safely ignore this email.
          </p>
          
          <p style="color: #999; font-size: 12px;">
            This link will expire in 1 hour.
          </p>
        </div>
      </body>
    </html>
  `;
  sendSmtpEmail.sender = {
    name: "ChatMe",
    email: process.env.BREVO_SENDER_EMAIL || "noreply@chatme.app"
  };
  sendSmtpEmail.to = [{ email, name: username }];

  try {
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Password reset email sent to:', email);
    return response;
  } catch (error) {
    console.error('❌ Error sending reset email:', error);
    throw error;
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
