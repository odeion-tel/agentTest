/**
 * Email utilities for password reset functionality
 */

interface EmailConfig {
  apiKey: string;
  domain: string;
  fromEmail: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send a password reset email
 * @param email The recipient's email address
 * @param resetToken The password reset token
 * @param config Email configuration
 * @returns Promise resolving to success status
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  config: EmailConfig
): Promise<{ success: boolean; message?: string }> {
  const resetUrl = `https://${config.domain}/app/reset-password?token=${resetToken}`;
  
  const emailOptions: SendEmailOptions = {
    to: email,
    subject: 'Password Reset Request',
    html: `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50;">Password Reset Request</h2>
            <p>You have requested to reset your password. Click the link below to set a new password:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Reset Password
              </a>
            </p>
            <p>This link will expire in 24 hours for security reasons.</p>
            <p>If you did not request this reset, please ignore this email.</p>
            <p style="color: #7f8c8d; font-size: 12px;">
              <strong>Security Tip:</strong> Never share this link with anyone. The link is valid for one-time use only.
            </p>
          </div>
        </body>
      </html>
    `,
    text: `Password Reset Request

You have requested to reset your password. Use this link to set a new password:

${resetUrl}

This link will expire in 24 hours for security reasons.

If you did not request this reset, please ignore this email.

Security Tip: Never share this link with anyone. The link is valid for one-time use only.`
  };

  try {
    const response = await fetch(`https://api.mailgun.net/v3/${config.domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${config.apiKey}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: config.fromEmail,
        to: emailOptions.to,
        subject: emailOptions.subject,
        html: emailOptions.html,
        text: emailOptions.text,
      }),
    });

    if (response.ok) {
      return { success: true };
    } else {
      const error = await response.text();
      console.error('Mailgun API error:', error);
      return { success: false, message: `Email service error: ${response.status}` };
    }
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return { success: false, message: 'Failed to send email' };
  }
}

/**
 * Validate email format
 * @param email Email address to validate
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}