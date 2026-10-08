/**
 * Builds the HTML body for a password reset email.
 *
 * SRP: this file owns only the password reset template.
 */
export function buildPasswordResetHtml(resetLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:36px 40px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Atlas Commerce Lab</p>
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">Reset your password</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:32px 40px;border-radius:0 0 16px 16px;">
              <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
                We received a request to reset the password for your account.
                Click the button below to choose a new password.
              </p>
              <p style="margin:0 0 24px;font-size:13px;color:#9ca3af;">
                This link expires in <strong style="color:#374151;">1 hour</strong>.
                If you didn't request a reset, you can safely ignore this email.
              </p>
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${resetLink}"
                   style="display:inline-block;background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;">
                  Reset Password →
                </a>
              </div>
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                Or copy this link into your browser:<br/>
                <span style="color:#6b7280;word-break:break-all;">${resetLink}</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
