/**
 * Options passed to the internal mail transport send method.
 * Keeping this as an interface (not a class) follows ISP — callers only
 * provide what the transport actually needs.
 */
export interface MailSendOptions {
  to: string;
  subject: string;
  html: string;
}
