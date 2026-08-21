/**
 * Minimal Resend client.
 *
 * Called over REST rather than through the SDK, matching how the sibling `sign`
 * project talks to Resend, and keeping the dependency surface at zero.
 *
 * `EMAIL_FROM` must be on a domain verified in Resend. The shared sandbox sender
 * `onboarding@resend.dev` can send but cannot receive, so it is no use here: the
 * whole point is that somebody replies to what we send.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type SendEmailOptions = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where a reply should go. For mention notifications this is the thread token address. */
  replyTo?: string;
};

const requireEnv = (name: 'RESEND_KEY' | 'EMAIL_FROM'): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}: cannot send email`);
  }

  return value;
};

export const sendEmail = async (options: SendEmailOptions): Promise<{ id: string }> => {
  const { to, subject, text, html, replyTo } = options;

  const apiKey = requireEnv('RESEND_KEY');
  const from = requireEnv('EMAIL_FROM');

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Resend rejected the message: ${response.status} - ${raw}`);
  }

  const result = JSON.parse(raw) as { id?: string };

  return { id: result.id ?? '' };
};
